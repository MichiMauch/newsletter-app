// Subject-Score endpoint.
//
// Combines the heuristic from lib/subject-score.ts with two data-driven
// layers:
//   - Layer 2: tokenises the candidate subject, finds the top-3 most
//     similar past sends (Jaccard on lowered tokens), averages their click
//     rate, and turns the delta vs the site's global CTR into a score
//     factor (±15 max).
//   - Layer 3 (opt-in via `?reasoning=1`): asks Claude Haiku for a short
//     reasoning that compares the candidate against the top-10 vs flop-10
//     historic subjects. Only triggered when the user clicks the badge,
//     not on every keystroke — so we don't burn tokens debouncing.
//
// Cold-start (<10 sends) falls back to the heuristic alone with a clear
// "Datenlage zu klein" label so the badge is honest about its confidence.
import { isAuthenticated } from '@/lib/admin-auth'
import { getDb } from '@/lib/db'
import { newsletterSends } from '@/lib/schema'
import { and, desc, eq } from 'drizzle-orm'
import {
  clamp,
  jaccardSimilarity,
  scoreSubjectHeuristic,
  tokenizeSubject,
  type SubjectScoreFactor,
} from '@/lib/subject-score'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'
import Anthropic from '@anthropic-ai/sdk'

const HISTORIC_LIMIT = 50
const COLD_START_THRESHOLD = 10
const SIMILARITY_FLOOR = 0.15
const TOP_SIMILAR = 3
const DATA_DELTA_CAP = 15

interface SimilarHistoricSend {
  subject: string
  similarity: number
  ctr: number
  recipientCount: number
}

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers })
  }

  let payload: { subject?: string; reasoning?: boolean }
  try {
    payload = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiges JSON.' }), { status: 400, headers })
  }

  const subject = (payload.subject ?? '').trim()
  if (subject.length === 0) {
    return new Response(
      JSON.stringify({
        score: 0,
        factors: [],
        similar: [],
        reasoning: null,
        coldStart: false,
      }),
      { status: 200, headers },
    )
  }

  const heuristic = scoreSubjectHeuristic(subject)
  const factors: SubjectScoreFactor[] = [...heuristic.factors]

  // ─── Layer 2: historic comparison
  const db = getDb()
  const historic = await db
    .select({
      subject: newsletterSends.subject,
      recipientCount: newsletterSends.recipientCount,
      clickedCount: newsletterSends.clickedCount,
      sentAt: newsletterSends.sentAt,
    })
    .from(newsletterSends)
    .where(and(eq(newsletterSends.siteId, SITE_ID), eq(newsletterSends.status, 'sent')))
    .orderBy(desc(newsletterSends.sentAt))
    .limit(HISTORIC_LIMIT)

  const usable = historic.filter((s) => s.recipientCount > 0)
  const coldStart = usable.length < COLD_START_THRESHOLD

  let similar: SimilarHistoricSend[] = []
  let dataFactor: SubjectScoreFactor | null = null

  if (coldStart) {
    factors.push({
      id: 'cold-start',
      label: `Datenlage zu klein (${usable.length} historische Sends, brauche ≥ ${COLD_START_THRESHOLD})`,
      delta: 0,
    })
  } else {
    const candidateTokens = tokenizeSubject(subject)
    const scored = usable
      .map((s) => {
        const tokens = tokenizeSubject(s.subject)
        const similarity = jaccardSimilarity(candidateTokens, tokens)
        return {
          subject: s.subject,
          similarity,
          ctr: s.clickedCount / s.recipientCount,
          recipientCount: s.recipientCount,
        }
      })
      .filter((s) => s.similarity >= SIMILARITY_FLOOR)
      .sort((a, b) => b.similarity - a.similarity)

    similar = scored.slice(0, TOP_SIMILAR)

    if (similar.length > 0) {
      const expectedCtr = avg(similar.map((s) => s.ctr))
      const globalCtr = avg(usable.map((s) => s.clickedCount / s.recipientCount))
      // (expected - global) is e.g. 0.03 over baseline → +9 points (×300, capped 15).
      const delta = clamp(Math.round((expectedCtr - globalCtr) * 300), -DATA_DELTA_CAP, DATA_DELTA_CAP)
      const formattedExpected = formatPercent(expectedCtr)
      const formattedGlobal = formatPercent(globalCtr)
      dataFactor = {
        id: 'historic-similarity',
        label: delta >= 0
          ? `Ähnliche Sends performten besser als Schnitt (${formattedExpected} vs ${formattedGlobal} Klickrate)`
          : `Ähnliche Sends performten schlechter als Schnitt (${formattedExpected} vs ${formattedGlobal} Klickrate)`,
        delta,
      }
      factors.push(dataFactor)
    } else {
      factors.push({
        id: 'no-similar',
        label: 'Keine ähnlichen Sends im Verlauf gefunden — Heuristik allein',
        delta: 0,
      })
    }
  }

  const sum = factors.reduce((acc, f) => acc + f.delta, 0)
  const score = clamp(50 + sum, 0, 100)

  // ─── Layer 3 (optional): Claude reasoning vs top/flop subjects
  let reasoning: string | null = null
  if (payload.reasoning && !coldStart) {
    try {
      reasoning = await getReasoning(subject, usable)
    } catch (err) {
      console.error('[subject-score] reasoning failed', err)
      reasoning = null
    }
  }

  return new Response(
    JSON.stringify({ score, factors, similar, reasoning, coldStart }),
    { status: 200, headers },
  )
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function formatPercent(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

async function getReasoning(
  subject: string,
  usable: { subject: string; recipientCount: number; clickedCount: number }[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const ranked = usable
    .map((s) => ({ subject: s.subject, ctr: s.clickedCount / s.recipientCount }))
    .sort((a, b) => b.ctr - a.ctr)
  const top = ranked.slice(0, 10)
  const flop = ranked.slice(-Math.min(10, ranked.length))

  const prompt = [
    'Du bist ein Newsletter-Coach. Vergleiche den unten stehenden Betreff-Vorschlag mit historischen Top- und Flop-Betreffen und gib in maximal 2 Sätzen (Schweizer Hochdeutsch, kein ß) eine konkrete Empfehlung. Keine Floskeln, kein "Hier sind…", direkt zur Sache.',
    '',
    `Vorschlag: "${subject}"`,
    '',
    'Top-10 (höchste Klickrate):',
    ...top.map((s) => `- "${s.subject}" → ${(s.ctr * 100).toFixed(1)}%`),
    '',
    'Flop-10 (niedrigste Klickrate):',
    ...flop.map((s) => `- "${s.subject}" → ${(s.ctr * 100).toFixed(1)}%`),
  ].join('\n')

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''
  return text || null
}
