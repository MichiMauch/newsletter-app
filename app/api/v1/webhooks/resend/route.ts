import { Webhook } from 'svix'
import * as Sentry from '@sentry/nextjs'
import { updateRecipientEvent, getRecipientByResendId } from '@/lib/newsletter'
import { bounceMetadata, type ResendBounce } from '@/lib/newsletter-bounces'
import { updateAutomationSendEvent } from '@/lib/automation'
import { enrollOnLinkClick } from '@/lib/graph-automation'
import { applyClickTagging } from '@/lib/auto-tag'
import { recordOpenSignal } from '@/lib/send-time-optimization'

interface ResendWebhookPayload {
  type: string
  created_at: string
  data: {
    email_id: string
    bounce?: ResendBounce
    click?: { link?: string }
    failed?: { reason?: string }
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[webhook/resend] RESEND_WEBHOOK_SECRET not configured')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const svixId = request.headers.get('svix-id')
  const svixTimestamp = request.headers.get('svix-timestamp')
  const svixSignature = request.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const body = await request.text()

  const wh = new Webhook(webhookSecret)
  let payload: ResendWebhookPayload
  try {
    payload = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookPayload
  } catch (err) {
    console.error('[webhook/resend] Signature verification failed:', err)
    return new Response('Invalid signature', { status: 401 })
  }

  const { type, created_at, data } = payload
  const emailId = data.email_id

  if (!emailId) {
    return new Response('OK', { status: 200 })
  }

  try {
    switch (type) {
      case 'email.delivered':
        await updateRecipientEvent(emailId, 'delivered', created_at)
        break
      case 'email.opened': {
        const recipient = await getRecipientByResendId(emailId)
        if (recipient) {
          await recordOpenSignal(recipient.site_id, recipient.email, created_at, 'opened', emailId)
        }
        break
      }
      case 'email.clicked':
        await updateRecipientEvent(emailId, 'clicked', created_at, { click_url: data.click?.link })
        break
      case 'email.bounced':
        await updateRecipientEvent(emailId, 'bounced', created_at, bounceMetadata(data.bounce))
        break
      case 'email.complained':
        await updateRecipientEvent(emailId, 'complained', created_at)
        break
      case 'email.delivery_delayed':
        // Resend versucht weiter zuzustellen. Ohne diesen Fall blieb die Mail
        // auf 'sent' stehen und war im UI nicht von einem echten Fehlschlag
        // zu unterscheiden.
        await updateRecipientEvent(emailId, 'delayed', created_at)
        break
      case 'email.failed':
        console.warn(`[webhook/resend] email.failed für ${emailId}:`, data.failed?.reason ?? '(kein Grund angegeben)')
        await updateRecipientEvent(emailId, 'failed', created_at)
        break
      case 'email.suppressed':
        // Adresse steht auf Resends Sperrliste — es wurde gar nicht erst
        // zugestellt. Kein Bounce, deshalb auch keine Bounce-Zählung.
        await updateRecipientEvent(emailId, 'suppressed', created_at)
        break
      case 'email.sent':
      case 'email.scheduled':
        // Bekannt, aber ohne Mehrwert: den Übergabezeitpunkt kennen wir aus dem
        // eigenen Versand-Log, und geplante Sends verwaltet scheduled_sends.
        break
      default:
        // Kein stiller Verlust: der Webhook ist bei Resend für deutlich mehr
        // Event-Typen registriert, als hier verarbeitet werden. Wenn ein neuer
        // auftaucht, soll er sichtbar sein statt lautlos zu verschwinden.
        console.info(`[webhook/resend] Unbehandelter Event-Typ: ${type}`)
        break
    }

    const automationEvent = type.replace('email.', '') as 'delivered' | 'clicked' | 'bounced' | 'complained'
    if (['delivered', 'clicked', 'bounced', 'complained'].includes(automationEvent)) {
      await updateAutomationSendEvent(emailId, automationEvent, created_at, bounceMetadata(data.bounce))
    }

    // Click events: fire link_clicked trigger and run auto-tagging
    if (type === 'email.clicked' && data.click?.link) {
      const recipient = await getRecipientByResendId(emailId)
      if (recipient) {
        await enrollOnLinkClick(recipient.site_id, recipient.email, data.click.link)
        await applyClickTagging(recipient.site_id, recipient.email, data.click.link)
        await recordOpenSignal(recipient.site_id, recipient.email, created_at, 'clicked', emailId)
      }
    }
  } catch (err) {
    console.error(`[webhook/resend] Error processing ${type}:`, err)
    Sentry.captureException(err, { tags: { area: 'webhook', kind: 'resend', event: type } })
    return new Response('Processing error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}
