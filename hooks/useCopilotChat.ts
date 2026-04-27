'use client'

import { useCallback, useState } from 'react'
import type { NewsletterBlock } from '@/lib/newsletter-blocks'

export type ToolName =
  | 'update_subject'
  | 'update_preheader'
  | 'update_text_block'
  | 'update_recap_label'

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: ToolName
  input: Record<string, unknown>
}

interface TextBlock {
  type: 'text'
  text: string
}

export type AssistantContent = TextBlock | ToolUseBlock

export interface ChatMessage {
  role: 'user' | 'assistant'
  /** Plain string for user turns; passed-through Anthropic content array for assistant turns. */
  content: string | AssistantContent[]
}

interface UseCopilotChatInput {
  subject: string
  preheader: string
  blocks: NewsletterBlock[]
}

const ASSISTANT_GREETING: ChatMessage = {
  role: 'assistant',
  content: [{
    type: 'text',
    text: 'Hi! Ich kenne deinen aktuellen Newsletter-Entwurf. Frag mich nach Vorschlägen für Subject, Preheader oder Texte — ich schlage konkrete Änderungen vor, die du per Klick übernehmen kannst.',
  }],
}

export function useCopilotChat({ subject, preheader, blocks }: UseCopilotChatInput) {
  const [messages, setMessages] = useState<ChatMessage[]>([ASSISTANT_GREETING])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // tool_use ids the user has applied OR dismissed — both states grey out
  // the diff card and prevent double-fire. We don't distinguish here
  // because the UI handles the visual state separately.
  const [resolvedToolIds, setResolvedToolIds] = useState<Set<string>>(() => new Set())

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (trimmed === '' || sending) return
    setError(null)
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setSending(true)
    try {
      const res = await fetch('/api/admin/ai-copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          state: {
            subject,
            preheader,
            blocks: blocks.map(serializeBlock),
          },
        }),
      })
      if (!res.ok) {
        const data = await safeJson(res)
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      const data = await res.json() as { role: 'assistant'; content: AssistantContent[] }
      setMessages((prev) => [...prev, { role: data.role, content: data.content }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSending(false)
    }
  }, [messages, sending, subject, preheader, blocks])

  const markResolved = useCallback((toolUseId: string) => {
    setResolvedToolIds((prev) => {
      const next = new Set(prev)
      next.add(toolUseId)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setMessages([ASSISTANT_GREETING])
    setResolvedToolIds(new Set())
    setError(null)
  }, [])

  return { messages, sending, error, send, markResolved, resolvedToolIds, reset }
}

function serializeBlock(b: NewsletterBlock) {
  switch (b.type) {
    case 'text':
      return { id: b.id, type: b.type, content: b.content }
    case 'hero':
      return { id: b.id, type: b.type, slug: b.slug }
    case 'link-list':
      return { id: b.id, type: b.type, slugs: b.slugs }
    case 'last_newsletter':
      return { id: b.id, type: b.type, recapLabel: b.recapLabel }
    case 'recap_header':
      // Not user-editable; included for context completeness.
      return { id: b.id, type: b.type }
  }
}

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try { return await res.json() } catch { return null }
}
