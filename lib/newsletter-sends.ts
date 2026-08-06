import { eq, and, sql } from 'drizzle-orm'
import { getDb } from './db'
import {
  newsletterSubscribers,
  newsletterSends,
  newsletterRecipients,
  newsletterLinkClicks,
  newsletterSendVariants,
} from './schema'

/**
 * Ein Send zählt für Reporting-Kennzahlen nur, wenn Resend uns dazu überhaupt
 * Webhook-Events geliefert hat. Das schliesst zwei Sorten Rauschen aus, ohne
 * eine willkürliche Mindestgrösse zu erfinden:
 *   - abgebrochene Versände (status = 'cancelled', nie zugestellt)
 *   - Alt-Sends von vor der Webhook-Integration (alle Zähler auf 0)
 * Ein echter Versand hat immer mindestens eine Zustellung oder einen Bounce —
 * dieselbe Bedingung wie der `hasTracking`-Gate in der History-Tabelle.
 */
export const TRACKED_SENDS = sql`status = 'sent' AND (delivered_count > 0 OR bounced_count > 0)`

/**
 * Resend klassifiziert Bounces als 'Permanent' | 'Transient' | 'Undetermined'
 * (Feld `data.bounce.type` im Webhook, verifiziert an einem echten Event:
 * {type: 'Transient', subType: 'General', diagnosticCode: [...]}).
 *
 * Vorher las der Webhook `data.bounce.bounce_type` — ein Feld, das Resend gar
 * nicht schickt — und verglich zusätzlich gegen 'hard'. Beides ging ins Leere:
 * alle Bounces landeten ohne Typ in der DB und kein einziger Hard Bounce wurde
 * je automatisch gesperrt.
 */
export const PERMANENT_BOUNCE_TYPE = 'Permanent'

// ─── Klick-Klassifikation ───────────────────────────────────────────────

/**
 * Ein Klick auf den Abmelde- oder Einstellungslink ist keine Zustimmung zum
 * Inhalt. Weil Resend auch diese Links umschreibt, zählten sie bisher voll in
 * die Klickrate — eine Abmeldung hob also die Kennzahl, die sie widerlegt.
 * Die Klicks werden weiter erfasst, nur nicht als Engagement gewertet.
 */
export function isUnsubscribeUrl(url: string): boolean {
  const path = url.toLowerCase()
  return /\/(unsubscribe|abmelden|preferences|einstellungen|subscription-center)\b/.test(path)
}

/**
 * Mail-Security-Scanner öffnen beim Zustellen jeden Link der Mail, um ihn zu
 * prüfen. Das erzeugt mehrere Klicks auf VERSCHIEDENE URLs innerhalb weniger
 * hundert Millisekunden — im Versand vom 06.08. zweimal drei Links in 106 bzw.
 * 45 ms. Ein Mensch schafft das nicht.
 *
 * Die Schwelle ist bewusst konservativ: lieber einen Scanner übersehen als
 * einen echten Leser als Bot abstempeln. Deshalb drei verschiedene URLs statt
 * zwei, und ein enges Fenster. Mehrfachklicks auf DIESELBE URL (echtes
 * Verhalten: zweimal auf denselben Artikel tippen) lösen nichts aus.
 */
export const SCANNER_WINDOW_MS = 2_000
export const SCANNER_DISTINCT_URLS = 3

export function isPermanentBounce(bounceType: string | null | undefined): boolean {
  return bounceType?.toLowerCase() === PERMANENT_BOUNCE_TYPE.toLowerCase()
}

// ─── Soft-Bounce-Sperre ─────────────────────────────────────────────────

/**
 * Ab wie vielen Bounces in Folge — ohne dazwischenliegende Zustellung — eine
 * Adresse gesperrt wird.
 *
 * Vorher galt "3 Bounces in 90 Tagen". Diese Regel konnte bei einem Newsletter,
 * der alle ein bis vier Monate erscheint, gar nicht auslösen: als der Bounce vom
 * 06.08. eintraf, waren die Bounces vom 10.03. und 08.04. längst aus dem Fenster
 * gefallen, der Zähler stand bei 1. info@grischa-system-solutions.ch ist bei
 * JEDEM der drei Versände gebounct — die Domain hat seit Monaten keinen
 * DNS-Eintrag mehr — und wäre trotzdem nie gesperrt worden.
 *
 * Der richtige Massstab ist nicht die Zeit, sondern die Zahl der Versuche.
 */
export const SOFT_BOUNCE_STREAK = 3

/**
 * Resend klassifiziert 'Undetermined', wenn es den Bounce nicht einordnen kann,
 * und empfiehlt, ihn bei Wiederholung wie einen Hard Bounce zu behandeln.
 * Deshalb hier eine niedrigere Schwelle als bei 'Transient'.
 */
export const UNDETERMINED_BOUNCE_STREAK = 2

export interface BounceStreak {
  /** Bounces seit der letzten erfolgreichen Zustellung. */
  count: number
  /** Ob alle davon 'Undetermined' waren. */
  allUndetermined: boolean
}

/**
 * Zählt die Bounces, die seit der letzten erfolgreichen Zustellung an diese
 * Adresse aufgelaufen sind.
 *
 * Nur eine Zustellung bricht die Serie. Versände, zu denen nie eine Rückmeldung
 * kam (Status 'sent', 'delayed', 'failed'), sind weder das eine noch das andere
 * und bleiben unberücksichtigt, statt die Serie fälschlich zurückzusetzen.
 *
 * Site-genau, weil dieselbe Adresse laut Schema auf mehreren Sites existieren
 * darf. Bounces aus Automations-Mails zählen nicht mit — die liegen in
 * email_automation_sends; dort greifen bislang nur die Sperren für Hard Bounce
 * und Beschwerde.
 */
export async function getBounceStreak(siteId: string, email: string): Promise<BounceStreak> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT nr.bounce_type
    FROM newsletter_recipients nr
    JOIN newsletter_sends ns ON ns.id = nr.send_id
    WHERE nr.email = ${email}
      AND ns.site_id = ${siteId}
      AND nr.status = 'bounced'
      AND ns.sent_at > COALESCE((
        SELECT MAX(ns2.sent_at)
        FROM newsletter_recipients nr2
        JOIN newsletter_sends ns2 ON ns2.id = nr2.send_id
        WHERE nr2.email = ${email}
          AND ns2.site_id = ${siteId}
          AND nr2.delivered_at IS NOT NULL
      ), '')
  `)
  const types = (rows.rows ?? []).map((r) => (r.bounce_type as string | null) ?? null)
  return {
    count: types.length,
    // Alt-Datensätze mit bounce_type NULL gelten NICHT als 'Undetermined' —
    // dort ist der Typ nie angekommen (siehe PERMANENT_BOUNCE_TYPE), das ist
    // fehlende Information und kein Befund.
    allUndetermined: types.length > 0 && types.every((t) => t?.toLowerCase() === 'undetermined'),
  }
}

/** Reicht die Serie, um die Adresse zu sperren? */
export function streakWarrantsBlock(streak: BounceStreak): boolean {
  if (streak.allUndetermined) return streak.count >= UNDETERMINED_BOUNCE_STREAK
  return streak.count >= SOFT_BOUNCE_STREAK
}

export interface NewsletterSend {
  id: number
  site_id: string
  post_slug: string
  post_title: string
  subject: string
  preheader: string | null
  sent_at: string
  scheduled_for: string | null
  recipient_count: number
  status: string
}

export type NewsletterRecipient = typeof newsletterRecipients.$inferSelect

export interface NewsletterSendStats extends NewsletterSend {
  delivered_count: number
  clicked_count: number
  bounced_count: number
  complained_count: number
}

export interface LinkClickStats {
  url: string
  click_count: number
  unique_clickers: number
}

export interface OverallStats {
  total_sends: number
  total_recipients: number
  avg_click_rate: number
  avg_bounce_rate: number
  total_complaints: number
}

export interface NewsletterRecipientRow {
  id: number
  email: string
  resend_email_id: string | null
  status: NewsletterRecipient['status']
  delivered_at: string | null
  clicked_at: string | null
  click_count: number
  bounced_at: string | null
  bounce_type: string | null
  bounce_sub_type: string | null
  bounce_message: string | null
  complained_at: string | null
  engagement_score: number | null
  engagement_tier: 'active' | 'moderate' | 'dormant' | 'cold' | null
}

export async function recordNewsletterSend(siteId: string, data: {
  post_slug: string
  post_title: string
  subject: string
  preheader?: string | null
  recipient_count: number
  blocks_json?: string
  scheduled_for?: string
  status?: 'sent' | 'scheduled'
}): Promise<number> {
  const db = getDb()
  const result = await db.insert(newsletterSends).values({
    siteId,
    postSlug: data.post_slug,
    postTitle: data.post_title,
    subject: data.subject,
    preheader: data.preheader ?? null,
    recipientCount: data.recipient_count,
    blocksJson: data.blocks_json ?? null,
    scheduledFor: data.scheduled_for ?? null,
    status: data.status ?? 'sent',
  }).returning({ id: newsletterSends.id })
  return result[0].id
}

export async function cancelNewsletterSend(sendId: number): Promise<void> {
  const db = getDb()
  await db.update(newsletterSends)
    .set({ status: 'cancelled' })
    .where(and(eq(newsletterSends.id, sendId), eq(newsletterSends.status, 'scheduled')))
}

export async function markScheduledSendAsSent(sendId: number): Promise<void> {
  const db = getDb()
  // Nur als 'sent' markieren, wenn der geplante Zeitpunkt erreicht ist.
  // Bei sofortigem Push eines geplanten Sends wartet der parent-Status, bis
  // scheduled_for tatsächlich vorbei ist — sonst zeigt die UI 'sent' an,
  // obwohl Resend die Mail erst später rausschickt.
  await db.run(sql`
    UPDATE newsletter_sends
    SET status = 'sent'
    WHERE id = ${sendId}
      AND status = 'scheduled'
      AND (scheduled_for IS NULL OR datetime(scheduled_for) <= datetime('now'))
  `)
}

export async function getLastSendWithBlocks(siteId: string): Promise<{ subject: string; preheader: string | null; blocks_json: string; post_slug: string } | null> {
  const db = getDb()
  const rows = await db.select({
    subject: newsletterSends.subject,
    preheader: newsletterSends.preheader,
    blocks_json: newsletterSends.blocksJson,
    post_slug: newsletterSends.postSlug,
  }).from(newsletterSends)
    .where(and(eq(newsletterSends.siteId, siteId), eq(newsletterSends.status, 'sent')))
    .orderBy(sql`${newsletterSends.sentAt} DESC`)
    .limit(1)
  const row = rows[0]
  if (!row || !row.blocks_json) return null
  return { subject: row.subject, preheader: row.preheader, blocks_json: row.blocks_json, post_slug: row.post_slug }
}

export async function getSendForRetry(sendId: number): Promise<{ subject: string; preheader: string | null; blocks_json: string } | null> {
  const db = getDb()
  const rows = await db.select({
    subject: newsletterSends.subject,
    preheader: newsletterSends.preheader,
    blocks_json: newsletterSends.blocksJson,
  })
    .from(newsletterSends).where(eq(newsletterSends.id, sendId)).limit(1)
  const row = rows[0]
  if (!row || !row.blocks_json) return null
  return { subject: row.subject, preheader: row.preheader, blocks_json: row.blocks_json }
}

export async function getNewsletterSends(siteId: string): Promise<NewsletterSend[]> {
  const db = getDb()
  const rows = await db.select().from(newsletterSends)
    .where(eq(newsletterSends.siteId, siteId))
    .orderBy(sql`${newsletterSends.sentAt} DESC`)
  return rows.map((r) => ({
    id: r.id, site_id: r.siteId, post_slug: r.postSlug, post_title: r.postTitle,
    subject: r.subject, preheader: r.preheader, sent_at: r.sentAt, scheduled_for: r.scheduledFor,
    recipient_count: r.recipientCount, status: r.status,
  }))
}

// ─── Recipient Tracking ─────────────────────────────────────────────

export async function recordNewsletterRecipientsBatch(
  recipients: { send_id: number; email: string; resend_email_id: string | null; variant_label?: string | null }[],
): Promise<void> {
  if (recipients.length === 0) return
  const db = getDb()
  const CHUNK_SIZE = 50
  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE)
    await db.insert(newsletterRecipients).values(
      chunk.map((r) => ({
        sendId: r.send_id,
        email: r.email,
        resendEmailId: r.resend_email_id,
        variantLabel: r.variant_label ?? null,
      })),
    )
  }
}

/** Fallback, wenn Resend ausnahmsweise kein `click.link` mitschickt. */
const UNKNOWN_CLICK_URL = '(unbekannt)'

/**
 * Prüft rückwirkend, ob die letzten Klicks dieses Empfängers ein Scanner-Burst
 * waren, und markiert in dem Fall das ganze Fenster als Bot.
 *
 * Rückwirkend, weil die Entscheidung beim ersten Klick noch nicht fällt: erst
 * wenn der dritte Link innerhalb von zwei Sekunden kommt, ist klar, dass auch
 * die ersten beiden vom Scanner stammten.
 */
async function flagScannerBurst(recipientId: number, timestamp: string): Promise<void> {
  const clickedAtMs = new Date(timestamp).getTime()
  if (Number.isNaN(clickedAtMs)) return
  const windowStart = new Date(clickedAtMs - SCANNER_WINDOW_MS).toISOString()

  const db = getDb()
  // clicked_at ist ein ISO-8601-String — dort ist die lexikografische Ordnung
  // gleich der zeitlichen, ein Stringvergleich reicht also.
  const distinct = await db.run(sql`
    SELECT COUNT(DISTINCT url) AS urls
    FROM newsletter_link_clicks
    WHERE recipient_id = ${recipientId}
      AND clicked_at >= ${windowStart}
      AND clicked_at <= ${timestamp}
  `)
  const urlCount = (distinct.rows?.[0]?.urls as number) ?? 0
  if (urlCount < SCANNER_DISTINCT_URLS) return

  await db.run(sql`
    UPDATE newsletter_link_clicks
    SET is_bot = 1
    WHERE recipient_id = ${recipientId}
      AND clicked_at >= ${windowStart}
      AND clicked_at <= ${timestamp}
  `)
}

/**
 * Schreibt Klickzähler aus newsletter_link_clicks zurück — auf die
 * Empfängerzeile, den Versand und ggf. die A/B-Variante.
 *
 * Gezählt wird nur, was als Engagement durchgeht: keine Scanner, keine
 * Abmeldeklicks. Fällt dadurch der letzte Klick eines Empfängers weg, muss auch
 * sein Status zurückfallen — sonst bliebe er als "Geklickt" stehen, obwohl kein
 * Klick mehr zählt.
 */
async function syncClickCounters(
  sendId: number,
  recipientId: number,
  variantLabel: string | null,
): Promise<void> {
  const db = getDb()
  const ENGAGEMENT = sql`is_bot = 0 AND is_unsubscribe = 0`

  await db.run(sql`
    UPDATE newsletter_recipients
    SET click_count = (
          SELECT COUNT(*) FROM newsletter_link_clicks
          WHERE recipient_id = ${recipientId} AND ${ENGAGEMENT}
        ),
        clicked_at = (
          SELECT MIN(clicked_at) FROM newsletter_link_clicks
          WHERE recipient_id = ${recipientId} AND ${ENGAGEMENT}
        ),
        status = CASE
          WHEN status IN ('bounced', 'complained') THEN status
          WHEN (SELECT COUNT(*) FROM newsletter_link_clicks
                WHERE recipient_id = ${recipientId} AND ${ENGAGEMENT}) > 0 THEN 'clicked'
          WHEN status = 'clicked' AND delivered_at IS NOT NULL THEN 'delivered'
          WHEN status = 'clicked' THEN 'sent'
          ELSE status
        END
    WHERE id = ${recipientId}
  `)

  await db.run(sql`
    UPDATE newsletter_sends
    SET clicked_count = (
      SELECT COUNT(DISTINCT recipient_id) FROM newsletter_link_clicks
      WHERE send_id = ${sendId} AND recipient_id IS NOT NULL AND ${ENGAGEMENT}
    )
    WHERE id = ${sendId}
  `)

  if (!variantLabel) return
  await db.run(sql`
    UPDATE newsletter_send_variants
    SET clicked_count = (
      SELECT COUNT(DISTINCT lc.recipient_id)
      FROM newsletter_link_clicks lc
      JOIN newsletter_recipients r ON r.id = lc.recipient_id
      WHERE lc.send_id = ${sendId} AND lc.is_bot = 0 AND lc.is_unsubscribe = 0
        AND r.variant_label = ${variantLabel}
    )
    WHERE send_id = ${sendId} AND label = ${variantLabel}
  `)
}

export type RecipientEvent =
  | 'delivered' | 'clicked' | 'bounced' | 'complained'
  | 'delayed' | 'failed' | 'suppressed'

export async function updateRecipientEvent(
  resendEmailId: string,
  event: RecipientEvent,
  timestamp: string,
  metadata?: { bounce_type?: string; bounce_sub_type?: string; bounce_message?: string; click_url?: string },
): Promise<void> {
  const db = getDb()

  // Join newsletter_sends to recover the site this recipient belongs to —
  // bounce/complaint state must be scoped to the originating site so a webhook
  // event for site A does not flip subscribers of site B who happen to share
  // the same email (the schema's uniqueIndex on (siteId, email) explicitly
  // allows the same address across sites).
  const existing = await db
    .select({
      id: newsletterRecipients.id,
      sendId: newsletterRecipients.sendId,
      email: newsletterRecipients.email,
      status: newsletterRecipients.status,
      clickCount: newsletterRecipients.clickCount,
      variantLabel: newsletterRecipients.variantLabel,
      siteId: newsletterSends.siteId,
    })
    .from(newsletterRecipients)
    .innerJoin(newsletterSends, eq(newsletterSends.id, newsletterRecipients.sendId))
    .where(eq(newsletterRecipients.resendEmailId, resendEmailId))
    .limit(1)

  if (existing.length === 0) return

  const recipient = existing[0]
  if (recipient.status === 'bounced' || recipient.status === 'complained') return

  /**
   * Zählt die Aggregate in newsletter_sends nur hoch, wenn das UPDATE auf der
   * Empfängerzeile wirklich etwas verändert hat.
   *
   * Vorher wurde erst gelesen (`recipient.clickCount === 0`) und danach
   * geschrieben — bei Link-Scannern, die mehrere Links im selben Millisekunden-
   * fenster abrufen, laufen die Webhooks parallel, beide lesen 0 und beide
   * zählen hoch. So ist clicked_count auseinandergelaufen (Send 12: 12 statt 11,
   * Send 7: 20 statt 19). Der Guard steckt jetzt im WHERE des UPDATEs, die
   * Entscheidung fällt also in der Datenbank statt in der Applikation.
   */
  async function bumpIfChanged(
    updateStatement: ReturnType<typeof sql>,
    field: 'deliveredCount' | 'clickedCount' | 'bouncedCount' | 'complainedCount',
  ): Promise<boolean> {
    const result = await db.run(updateStatement)
    if ((result.rowsAffected ?? 0) === 0) return false
    const sendColumn = newsletterSends[field]
    await db.update(newsletterSends)
      .set({ [field]: sql`${sendColumn} + 1` })
      .where(eq(newsletterSends.id, recipient.sendId))
    await bumpVariant(field)
    return true
  }

  async function bumpVariant(field: 'deliveredCount' | 'clickedCount' | 'bouncedCount' | 'complainedCount') {
    if (!recipient.variantLabel) return
    const column = newsletterSendVariants[field]
    await db.update(newsletterSendVariants)
      .set({ [field]: sql`${column} + 1` })
      .where(and(
        eq(newsletterSendVariants.sendId, recipient.sendId),
        eq(newsletterSendVariants.label, recipient.variantLabel),
      ))
  }

  switch (event) {
    case 'delivered': {
      // `delivered_at IS NULL` ist der verlässliche Erst-Zustellungs-Marker:
      // status kann bereits 'clicked' sein, wenn der Klick-Webhook zuerst ankam.
      // Aus 'delayed' (und den anderen Zwischenständen) muss 'delivered' werden,
      // sobald die Zustellung doch klappt — sonst bliebe die Mail für immer als
      // verzögert stehen. 'clicked' ist die stärkere Aussage und bleibt.
      await bumpIfChanged(sql`
        UPDATE newsletter_recipients
        SET status = CASE
              WHEN status IN ('sent', 'delayed', 'failed', 'suppressed') THEN 'delivered'
              ELSE status
            END,
            delivered_at = ${timestamp}
        WHERE id = ${recipient.id}
          AND delivered_at IS NULL
          AND status NOT IN ('bounced', 'complained')
      `, 'deliveredCount')
      break
    }
    case 'clicked': {
      // Klicks werden nicht mehr hochgezählt, sondern aus newsletter_link_clicks
      // ABGELEITET. Das ist nötig, weil ein Klick nachträglich seine Bedeutung
      // ändern kann: erst der zweite und dritte Scanner-Klick verraten, dass
      // auch der erste keiner war. Nebeneffekt — abgeleitete Werte können
      // grundsätzlich nicht doppelt zählen, egal wie die Webhooks eintreffen.
      const url = metadata?.click_url ?? UNKNOWN_CLICK_URL
      await db.run(sql`
        INSERT INTO newsletter_link_clicks (send_id, recipient_id, url, clicked_at, is_bot, is_unsubscribe)
        SELECT ${recipient.sendId}, ${recipient.id}, ${url}, ${timestamp}, 0, ${isUnsubscribeUrl(url) ? 1 : 0}
        -- Resend stellt Webhooks erneut zu, wenn unsere Antwort nicht 200 war.
        -- Gleicher Empfänger, gleiche URL, gleiche Millisekunde = dasselbe
        -- Ereignis, kein zweiter Klick.
        WHERE NOT EXISTS (
          SELECT 1 FROM newsletter_link_clicks
          WHERE recipient_id = ${recipient.id} AND url = ${url} AND clicked_at = ${timestamp}
        )
      `)
      await flagScannerBurst(recipient.id, timestamp)
      await syncClickCounters(recipient.sendId, recipient.id, recipient.variantLabel)
      break
    }
    case 'bounced': {
      const bounced = await bumpIfChanged(sql`
        UPDATE newsletter_recipients
        SET status = 'bounced',
            bounced_at = ${timestamp},
            bounce_type = ${metadata?.bounce_type ?? null},
            bounce_sub_type = ${metadata?.bounce_sub_type ?? null},
            bounce_message = ${metadata?.bounce_message ?? null}
        WHERE id = ${recipient.id}
          AND status NOT IN ('bounced', 'complained')
      `, 'bouncedCount')
      // Ein wiederholtes Bounce-Event für denselben Empfänger darf weder den
      // Zähler noch die Sperr-Schwelle ein zweites Mal bewegen.
      if (!bounced) break

      if (isPermanentBounce(metadata?.bounce_type)) {
        await db.update(newsletterSubscribers)
          .set({ status: 'blocked', blockedAt: sql`datetime('now')` })
          .where(and(
            eq(newsletterSubscribers.siteId, recipient.siteId),
            eq(newsletterSubscribers.email, recipient.email),
            eq(newsletterSubscribers.status, 'active'),
          ))
      } else {
        // Soft/unbekannter Bounce: sperren, sobald genug Versuche in Folge
        // gescheitert sind. Der Zeitbezug ist bewusst weg — siehe
        // SOFT_BOUNCE_STREAK.
        const streak = await getBounceStreak(recipient.siteId, recipient.email)
        if (streakWarrantsBlock(streak)) {
          await db.update(newsletterSubscribers)
            .set({ status: 'blocked', blockedAt: sql`datetime('now')` })
            .where(and(
              eq(newsletterSubscribers.siteId, recipient.siteId),
              eq(newsletterSubscribers.email, recipient.email),
              eq(newsletterSubscribers.status, 'active'),
            ))
        }
      }
      break
    }
    case 'complained': {
      const complained = await bumpIfChanged(sql`
        UPDATE newsletter_recipients
        SET status = 'complained', complained_at = ${timestamp}
        WHERE id = ${recipient.id}
          AND status NOT IN ('bounced', 'complained')
      `, 'complainedCount')
      if (!complained) break
      await db.update(newsletterSubscribers)
        .set({ status: 'blocked', blockedAt: sql`datetime('now')` })
        .where(and(
          eq(newsletterSubscribers.siteId, recipient.siteId),
          eq(newsletterSubscribers.email, recipient.email),
          eq(newsletterSubscribers.status, 'active'),
        ))
      break
    }
    case 'delayed':
    case 'failed':
    case 'suppressed': {
      // Zustandsmeldungen ohne eigenen Zähler. Sie überschreiben nur den
      // Zwischenstand 'sent' — eine bereits zugestellte oder geklickte Mail
      // darf ein spät eintreffendes Ereignis nicht zurückdrehen, und ein
      // Bounce bleibt das endgültigere Signal.
      //
      // 'delayed' ist der wichtige Fall: bisher blieb so eine Mail auf 'sent'
      // stehen und war im UI nicht von einem echten Fehlschlag zu
      // unterscheiden, obwohl Resend noch selbst weiterversucht.
      await db.run(sql`
        UPDATE newsletter_recipients
        SET status = ${event}
        WHERE id = ${recipient.id}
          AND status IN ('sent', 'delayed')
      `)
      break
    }
  }
}

/**
 * Hat dieser Subscriber einen Link in einem Newsletter geklickt?
 *
 * Quelle ist newsletter_link_clicks — die einzige Stelle, an der Klicks samt
 * URL landen. Klicks auf Mails, die eine Automation selbst verschickt hat,
 * sind hier NICHT enthalten: Graph-Automationen legen für ihre Sends gar keine
 * Empfängerzeile an (siehe graph-processor.ts, `void resendEmailId`), die
 * Webhooks finden also nichts zum Zuordnen.
 *
 * @param since       nur Klicks ab diesem Zeitpunkt (ISO) — z. B. der Beginn
 *                    der Automation, damit die Bedingung nicht auf einen Klick
 *                    von vor einem Jahr anspringt
 * @param urlContains Teilstring-Filter auf die geklickte URL
 */
export async function hasClickedNewsletterLink(
  siteId: string,
  email: string,
  opts: { since?: string | null; urlContains?: string | null } = {},
): Promise<boolean> {
  const db = getDb()
  const since = opts.since ?? null
  const urlContains = opts.urlContains?.trim() || null
  const rows = await db.run(sql`
    SELECT 1 AS hit
    FROM newsletter_link_clicks lc
    JOIN newsletter_recipients r ON r.id = lc.recipient_id
    JOIN newsletter_sends s ON s.id = lc.send_id
    WHERE s.site_id = ${siteId}
      AND r.email = ${email}
      -- Weder ein Scanner noch eine Abmeldung darf eine Automation in den
      -- Ja-Pfad schicken. Gerade beim Abmeldeklick wäre das grotesk: die
      -- Automation würde ausgerechnet dem hinterherlaufen, der gerade
      -- gegangen ist.
      AND lc.is_bot = 0
      AND lc.is_unsubscribe = 0
      AND (${since} IS NULL OR lc.clicked_at >= ${since})
      AND (${urlContains} IS NULL OR lc.url LIKE '%' || ${urlContains} || '%')
    LIMIT 1
  `)
  return (rows.rows?.length ?? 0) > 0
}

export async function getRecipientByResendId(resendEmailId: string): Promise<{ email: string; site_id: string } | null> {
  const db = getDb()
  const rows = await db
    .select({ email: newsletterRecipients.email, siteId: newsletterSends.siteId })
    .from(newsletterRecipients)
    .innerJoin(newsletterSends, eq(newsletterSends.id, newsletterRecipients.sendId))
    .where(eq(newsletterRecipients.resendEmailId, resendEmailId))
    .limit(1)
  if (rows.length === 0) return null
  return { email: rows[0].email, site_id: rows[0].siteId }
}

export async function getNewsletterSendsWithStats(siteId: string): Promise<NewsletterSendStats[]> {
  const db = getDb()
  const rows = await db.select().from(newsletterSends)
    .where(eq(newsletterSends.siteId, siteId))
    .orderBy(sql`COALESCE(${newsletterSends.scheduledFor}, ${newsletterSends.sentAt}) DESC`)
  return rows.map((r) => ({
    id: r.id, site_id: r.siteId, post_slug: r.postSlug, post_title: r.postTitle,
    subject: r.subject, preheader: r.preheader, sent_at: r.sentAt, scheduled_for: r.scheduledFor,
    recipient_count: r.recipientCount, status: r.status,
    delivered_count: r.deliveredCount, clicked_count: r.clickedCount,
    bounced_count: r.bouncedCount, complained_count: r.complainedCount,
  }))
}

export async function getSendBlocksJson(sendId: number): Promise<string | null> {
  const db = getDb()
  const rows = await db.select({ blocksJson: newsletterSends.blocksJson })
    .from(newsletterSends).where(eq(newsletterSends.id, sendId)).limit(1)
  return rows[0]?.blocksJson ?? null
}

export async function getRecipientsForSend(siteId: string, sendId: number): Promise<NewsletterRecipientRow[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT
      nr.id, nr.email, nr.resend_email_id, nr.status,
      nr.delivered_at, nr.clicked_at, nr.click_count,
      nr.bounced_at, nr.bounce_type, nr.bounce_sub_type, nr.bounce_message,
      nr.complained_at,
      se.score AS engagement_score, se.tier AS engagement_tier
    FROM newsletter_recipients nr
    LEFT JOIN subscriber_engagement se
      ON se.site_id = ${siteId} AND se.subscriber_email = nr.email
    WHERE nr.send_id = ${sendId}
    ORDER BY nr.email
  `)
  return (rows.rows ?? []).map((r) => ({
    id: r.id as number,
    email: r.email as string,
    resend_email_id: (r.resend_email_id as string | null) ?? null,
    status: r.status as NewsletterRecipientRow['status'],
    delivered_at: (r.delivered_at as string | null) ?? null,
    clicked_at: (r.clicked_at as string | null) ?? null,
    click_count: (r.click_count as number) ?? 0,
    bounced_at: (r.bounced_at as string | null) ?? null,
    bounce_type: (r.bounce_type as string | null) ?? null,
    bounce_sub_type: (r.bounce_sub_type as string | null) ?? null,
    bounce_message: (r.bounce_message as string | null) ?? null,
    complained_at: (r.complained_at as string | null) ?? null,
    engagement_score: (r.engagement_score as number | null) ?? null,
    engagement_tier: (r.engagement_tier as NewsletterRecipientRow['engagement_tier']) ?? null,
  }))
}

export async function getFailedRecipientsForSend(siteId: string, sendId: number): Promise<{ email: string; token: string }[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT s.email, s.token
    FROM newsletter_recipients nr
    JOIN newsletter_subscribers s ON s.email = nr.email AND s.status = 'active' AND s.site_id = ${siteId}
    WHERE nr.send_id = ${sendId} AND nr.resend_email_id IS NULL
  `)
  return (rows.rows ?? []).map((r) => ({ email: r.email as string, token: r.token as string }))
}

export async function updateRecipientResendId(sendId: number, email: string, resendEmailId: string): Promise<void> {
  const db = getDb()
  await db.update(newsletterRecipients)
    .set({ resendEmailId, status: 'sent' })
    .where(and(eq(newsletterRecipients.sendId, sendId), eq(newsletterRecipients.email, email)))
}

export async function getLinkClicksForSend(sendId: number): Promise<LinkClickStats[]> {
  const db = getDb()
  // Scanner-Klicks bleiben draussen: sie sagen nichts über das Interesse an
  // einem Link aus, verzerren aber die Rangfolge (ein Scanner klickt jeden
  // Link genau einmal). Abmeldeklicks bleiben sichtbar — dass sich jemand über
  // den Link abgemeldet hat, ist eine echte und interessante Information.
  const rows = await db.run(sql`
    SELECT url, COUNT(*) as click_count, COUNT(DISTINCT recipient_id) as unique_clickers
    FROM newsletter_link_clicks WHERE send_id = ${sendId} AND is_bot = 0
    GROUP BY url ORDER BY click_count DESC
  `)
  return (rows.rows ?? []).map((r) => ({
    url: r.url as string, click_count: r.click_count as number, unique_clickers: r.unique_clickers as number,
  }))
}

/**
 * Zeitpunkte ALLER Engagement-Klicks eines Versands, für die Zeitachse.
 *
 * Bewusst nicht recipients.clicked_at: dort steht nur der erste Klick pro
 * Person. Für die Frage "wann kamen die Klicks rein" zählt jeder einzelne.
 * Scanner- und Abmeldeklicks bleiben draussen — ein Scanner klickt in der
 * Sekunde der Zustellung und würde einen Ausschlag ganz links erzeugen, der
 * mit dem Verhalten der Leser nichts zu tun hat.
 */
export async function getClickTimestampsForSend(sendId: number): Promise<string[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT clicked_at
    FROM newsletter_link_clicks
    WHERE send_id = ${sendId} AND is_bot = 0 AND is_unsubscribe = 0
    ORDER BY clicked_at
  `)
  return (rows.rows ?? []).map((r) => r.clicked_at as string)
}

export async function getOverallNewsletterStats(siteId: string): Promise<OverallStats> {
  const db = getDb()
  // Nur Sends mit echten Tracking-Daten zählen (siehe TRACKED_SENDS): abgebrochene
  // Versände und Alt-Sends aus der Zeit vor dem Webhook haben delivered/bounced = 0
  // und würden die Ø-Raten sonst mit einem leeren Nenner verwässern.
  // Klickrate gegen delivered_count (Branchenstandard — wer nichts bekommen hat,
  // kann nicht klicken), Bounce-Rate gegen recipient_count (Bounces sind ja
  // gerade die nicht zugestellten).
  const rows = await db.run(sql`
    SELECT
      COUNT(*) as total_sends, SUM(recipient_count) as total_recipients,
      CASE WHEN SUM(delivered_count) > 0 THEN ROUND(CAST(SUM(clicked_count) AS REAL) / SUM(delivered_count) * 100, 1) ELSE 0 END as avg_click_rate,
      CASE WHEN SUM(recipient_count) > 0 THEN ROUND(CAST(SUM(bounced_count) AS REAL) / SUM(recipient_count) * 100, 1) ELSE 0 END as avg_bounce_rate,
      SUM(complained_count) as total_complaints
    FROM newsletter_sends WHERE site_id = ${siteId} AND ${TRACKED_SENDS}
  `)
  const r = rows.rows?.[0] ?? {}
  return {
    total_sends: (r.total_sends as number) || 0, total_recipients: (r.total_recipients as number) || 0,
    avg_click_rate: (r.avg_click_rate as number) || 0,
    avg_bounce_rate: (r.avg_bounce_rate as number) || 0, total_complaints: (r.total_complaints as number) || 0,
  }
}
