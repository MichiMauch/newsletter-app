import { isAuthenticated } from '@/lib/admin-auth'
import { getDb } from '@/lib/db'
import { adminSettings } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import {
  DEFAULT_INTRO_PROMPT,
  DEFAULT_SUBJECT_PROMPT,
  buildPrompt,
  type AiPostInput,
} from '@/lib/ai-prompts'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY nicht konfiguriert.' }, { status: 500 })
  }

  const body = await request.json()
  const { type, posts } = body as {
    type: 'intro' | 'subject'
    posts: AiPostInput[]
  }

  if (!posts || posts.length === 0) {
    return Response.json({ error: 'Keine Artikel angegeben.' }, { status: 400 })
  }

  const settingsKey = type === 'subject' ? 'subject_prompt' : 'intro_prompt'
  const fallback = type === 'subject' ? DEFAULT_SUBJECT_PROMPT : DEFAULT_INTRO_PROMPT

  const db = getDb()
  const row = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.key, settingsKey))
    .get()
  const template = row?.value?.trim() ? row.value : fallback

  const prompt = buildPrompt(template, posts)

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: type === 'subject' ? 600 : 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    if (type === 'subject') {
      const subjects = parseSubjects(text)
      if (subjects.length === 0) {
        return Response.json({ error: 'AI-Antwort konnte nicht ausgewertet werden.' }, { status: 500 })
      }
      return Response.json({ subjects })
    }

    return Response.json({ text })
  } catch (err: unknown) {
    console.error('[ai-generate]', err)
    return Response.json({ error: 'AI-Generierung fehlgeschlagen.' }, { status: 500 })
  }
}

function parseSubjects(raw: string): string[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) {
      return parsed
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter((s) => s.length > 0)
        .slice(0, 5)
    }
  } catch {
    // fall through to line-based parsing
  }

  return cleaned
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["']|["']$/g, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 5)
}
