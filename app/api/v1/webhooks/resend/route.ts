import { Webhook } from 'svix'
import { updateRecipientEvent, getRecipientByResendId } from '@/lib/newsletter'
import { updateAutomationSendEvent } from '@/lib/automation'
import { enrollOnLinkClick } from '@/lib/graph-automation'
import { applyClickTagging } from '@/lib/auto-tag'
import { recordOpenSignal } from '@/lib/send-time-optimization'

interface ResendWebhookPayload {
  type: string
  created_at: string
  data: {
    email_id: string
    bounce?: { bounce_type?: string }
    click?: { link?: string }
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
        await updateRecipientEvent(emailId, 'bounced', created_at, { bounce_type: data.bounce?.bounce_type })
        break
      case 'email.complained':
        await updateRecipientEvent(emailId, 'complained', created_at)
        break
    }

    const automationEvent = type.replace('email.', '') as 'delivered' | 'clicked' | 'bounced' | 'complained'
    if (['delivered', 'clicked', 'bounced', 'complained'].includes(automationEvent)) {
      await updateAutomationSendEvent(emailId, automationEvent, created_at, {
        bounce_type: data.bounce?.bounce_type,
      })
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
    return new Response('Processing error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}
