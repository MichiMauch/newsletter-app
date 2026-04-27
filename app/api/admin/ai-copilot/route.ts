// AI Co-Pilot endpoint.
//
// Stateless — each request from the client carries the full chat history
// plus the current newsletter state (subject, preheader, blocks). Claude
// answers with a short message and zero or more tool_use blocks. The
// frontend renders each tool_use as a diff card; the user accepts or
// dismisses individually, which fires the existing onSubjectChange /
// onUpdateBlock callbacks. No tool_result loop yet — we keep things
// simple: every new user prompt re-sends fresh state, so Claude always
// reasons against the latest blocks.
import { isAuthenticated } from '@/lib/admin-auth'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1024

interface ClientBlock {
  id: string
  type: string
  // Per-type interesting content. Only the editor-relevant fields are sent
  // — we don't ship the whole post objects (those are in the blocks_json
  // we'd persist) to keep prompt budget tight.
  content?: string
  slug?: string
  slugs?: string[]
  recapLabel?: string
}

interface CopilotMessage {
  role: 'user' | 'assistant'
  /**
   * For user turns: plain string the user typed.
   * For assistant turns: the same content array Anthropic returned, kept
   * verbatim so multi-turn stays coherent (text + tool_use blocks).
   */
  content: string | Anthropic.Messages.ContentBlockParam[]
}

interface CopilotRequest {
  messages: CopilotMessage[]
  state: {
    subject: string
    preheader: string
    blocks: ClientBlock[]
  }
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'update_subject',
    description: 'Replace the newsletter subject line. Use this to suggest a stronger or clearer subject.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'The new subject line, plain text only.' },
        rationale: { type: 'string', description: 'One short sentence explaining why this is better.' },
      },
      required: ['subject'],
    },
  },
  {
    name: 'update_preheader',
    description: 'Replace the preheader (inbox preview line). Keep ≤110 chars for Gmail/Apple Mail.',
    input_schema: {
      type: 'object',
      properties: {
        preheader: { type: 'string', description: 'The new preheader.' },
        rationale: { type: 'string' },
      },
      required: ['preheader'],
    },
  },
  {
    name: 'update_text_block',
    description: 'Replace the HTML content of a text block. Use the same lightweight HTML the editor uses (paragraphs, lists, links).',
    input_schema: {
      type: 'object',
      properties: {
        blockId: { type: 'string', description: 'The id of the text block to replace.' },
        content: { type: 'string', description: 'New HTML content for the block.' },
        rationale: { type: 'string' },
      },
      required: ['blockId', 'content'],
    },
  },
  {
    name: 'update_recap_label',
    description: 'Change the heading label for a "last_newsletter" recap block.',
    input_schema: {
      type: 'object',
      properties: {
        blockId: { type: 'string' },
        label: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['blockId', 'label'],
    },
  },
]

const SYSTEM_PROMPT = `Du bist ein Newsletter-Co-Autor. Du arbeitest gemeinsam mit der Redaktion an einem konkreten Newsletter-Entwurf.
Antworte ausschliesslich auf Deutsch (Schweizer Hochdeutsch, kein ß).

REGELN — strikt befolgen:
1. JEDE konkrete Änderung MUSS als Tool-Call erfolgen (update_subject, update_preheader, update_text_block, update_recap_label). NIE den Vorschlagstext im Text-Output nennen.
2. Wenn die Redaktion N Varianten oder N Vorschläge anfragt ("3 Varianten", "ein paar Subjects", "mehrere Optionen"), emittiere N separate Tool-Calls in derselben Antwort — einen pro Variante. Nicht "hier sind drei:" gefolgt von einem Tool-Call und Text — sondern wirklich N Tool-Calls.
3. Dein Text-Output ist maximal 1 kurzer Satz als Einleitung ("Drei Varianten:", "Hier mein Vorschlag:"). KEINE Aufzählung der Vorschläge im Text — die kommen NUR über die Tools.
4. Stelle nie Rückfragen wenn du genug Kontext hast. Schlage einfach vor.
5. Du siehst den aktuellen Newsletter-Stand unten im System-Prompt. Beziehe dich konkret darauf.`

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht konfiguriert.' }), { status: 500, headers })
  }

  let payload: CopilotRequest
  try {
    payload = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiges JSON.' }), { status: 400, headers })
  }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Mindestens eine Nachricht erforderlich.' }), { status: 400, headers })
  }

  const stateBlock = formatStateForPrompt(payload.state)
  const fullSystem = `${SYSTEM_PROMPT}\n\n--- AKTUELLER NEWSLETTER-STAND ---\n${stateBlock}`

  // Map our message envelope to the Anthropic SDK shape. Strings stay
  // strings; pre-formed content arrays (from prior assistant turns) pass
  // through as-is.
  const messages: Anthropic.Messages.MessageParam[] = payload.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  try {
    const client = new Anthropic({ apiKey })
    const reply = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: fullSystem,
      tools: TOOLS,
      messages,
    })

    return new Response(
      JSON.stringify({
        role: 'assistant',
        content: reply.content,
        stopReason: reply.stop_reason,
        usage: reply.usage,
      }),
      { status: 200, headers },
    )
  } catch (err) {
    console.error('[ai-copilot]', err)
    return new Response(
      JSON.stringify({ error: 'AI-Anfrage fehlgeschlagen.' }),
      { status: 500, headers },
    )
  }
}

function formatStateForPrompt(state: CopilotRequest['state']): string {
  const lines: string[] = []
  lines.push(`Subject: ${state.subject || '(leer)'}`)
  lines.push(`Preheader: ${state.preheader || '(leer)'}`)
  lines.push('')
  lines.push('Blöcke (in Reihenfolge):')
  if (state.blocks.length === 0) {
    lines.push('  (keine)')
  } else {
    for (let i = 0; i < state.blocks.length; i++) {
      const b = state.blocks[i]
      const label = `[${i}] id=${b.id} type=${b.type}`
      if (b.type === 'text') {
        lines.push(`${label}\n      content: ${truncate(b.content ?? '', 600)}`)
      } else if (b.type === 'hero') {
        lines.push(`${label} slug=${b.slug ?? '(none)'}`)
      } else if (b.type === 'link-list') {
        lines.push(`${label} slugs=${(b.slugs ?? []).join(',') || '(none)'}`)
      } else if (b.type === 'last_newsletter') {
        lines.push(`${label} recapLabel=${b.recapLabel ?? '(default)'}`)
      } else {
        lines.push(label)
      }
    }
  }
  return lines.join('\n')
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…(${s.length - max} weitere Zeichen)`
}
