import { isAuthenticated } from '@/lib/admin-auth'
import { getDb } from '@/lib/db'
import { newsletterSends, newsletterSubscribers, subscriberEngagement } from '@/lib/schema'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const SITE_ID = 'kokomo'

type Insight = 'dashboard-summary' | 'subscriber-risk'

const SYSTEM_PROMPT = `Du bist ein freundlicher Newsletter-Analyse-Assistent.
Antworte ausschliesslich auf Deutsch (Schweizer Hochdeutsch, kein ß).
Halte dich kurz: 2–4 Sätze maximal, keine Aufzählungen, keine Markdown-Headlines.
Triff klare Aussagen statt Floskeln und nenne konkrete Zahlen.`

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht konfiguriert.' }), { status: 500, headers })
  }

  let payload: { type?: Insight }
  try {
    payload = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiges JSON.' }), { status: 400, headers })
  }

  try {
    const facts = await collectFacts(payload.type ?? 'dashboard-summary')
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: facts }],
    })
    const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''
    if (!text) {
      return new Response(JSON.stringify({ error: 'Leere AI-Antwort.' }), { status: 502, headers })
    }
    return new Response(JSON.stringify({ text }), { status: 200, headers })
  } catch (err) {
    console.error('[ai-insight]', err)
    return new Response(JSON.stringify({ error: 'AI-Anfrage fehlgeschlagen.' }), { status: 500, headers })
  }
}

async function collectFacts(type: Insight): Promise<string> {
  const db = getDb()

  if (type === 'dashboard-summary') {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const [confirmed] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(newsletterSubscribers)
      .where(and(eq(newsletterSubscribers.siteId, SITE_ID), eq(newsletterSubscribers.status, 'confirmed')))
    const [newSubs] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(newsletterSubscribers)
      .where(and(eq(newsletterSubscribers.siteId, SITE_ID), gte(newsletterSubscribers.createdAt, since)))
    const recentSends = await db.select({
      subject: newsletterSends.subject,
      sentAt: newsletterSends.sentAt,
      recipientCount: newsletterSends.recipientCount,
      clickedCount: newsletterSends.clickedCount,
      bouncedCount: newsletterSends.bouncedCount,
    })
      .from(newsletterSends)
      .where(and(eq(newsletterSends.siteId, SITE_ID), eq(newsletterSends.status, 'sent')))
      .orderBy(desc(newsletterSends.sentAt))
      .limit(5)

    const lines = [
      `Aktive Abos: ${confirmed?.c ?? 0}`,
      `Neue Abos in den letzten 30 Tagen: ${newSubs?.c ?? 0}`,
      'Letzte 5 Newsletter:',
    ]
    for (const s of recentSends) {
      const ctr = s.recipientCount > 0 ? ((s.clickedCount / s.recipientCount) * 100).toFixed(1) : '0.0'
      const bounceRate = s.recipientCount > 0 ? ((s.bouncedCount / s.recipientCount) * 100).toFixed(1) : '0.0'
      lines.push(`- "${s.subject}" → ${s.recipientCount} Empfänger · ${ctr}% Klickrate · ${bounceRate}% Bounces`)
    }
    return `Fasse den Newsletter-Stand der letzten 30 Tage in 2–3 Sätzen zusammen. Was lief gut, was sollte beobachtet werden? Sei konkret und nutze die Zahlen.\n\nDaten:\n${lines.join('\n')}`
  }

  if (type === 'subscriber-risk') {
    const tiers = await db.select({
      tier: subscriberEngagement.tier,
      count: sql<number>`COUNT(*)`,
    })
      .from(subscriberEngagement)
      .where(eq(subscriberEngagement.siteId, SITE_ID))
      .groupBy(subscriberEngagement.tier)
    const rows = tiers.map((t) => `${t.tier}: ${t.count}`).join(' · ')
    const [coldList] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(subscriberEngagement)
      .where(and(eq(subscriberEngagement.siteId, SITE_ID), eq(subscriberEngagement.tier, 'cold')))
    const [dormant] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(subscriberEngagement)
      .where(and(eq(subscriberEngagement.siteId, SITE_ID), eq(subscriberEngagement.tier, 'dormant')))
    return `Analysiere das Engagement-Risiko der Liste in 2–3 Sätzen. Wer ist gefährdet, sich abzumelden? Schlage einen konkreten nächsten Schritt vor (z.B. Re-Engagement-Kampagne).\n\nVerteilung nach Tier: ${rows}\nKalt (lange keine Aktivität): ${coldList?.c ?? 0}\nSchlafend: ${dormant?.c ?? 0}`
  }

  throw new Error(`Unbekannter Insight-Typ: ${type}`)
}
