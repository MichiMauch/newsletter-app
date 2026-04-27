'use client'

import { useEffect, useRef, useState } from 'react'
import {
  useCopilotChat,
  type AssistantContent,
  type ToolName,
} from '@/hooks/useCopilotChat'
import type { NewsletterBlock, TextBlock, LastNewsletterBlock } from '@/lib/newsletter-blocks'

interface Props {
  subject: string
  preheader: string
  blocks: NewsletterBlock[]
  onSubjectChange: (value: string) => void
  onPreheaderChange: (value: string) => void
  onUpdateBlock: (index: number, updated: NewsletterBlock) => void
  onClose: () => void
}

export default function StudioCopilot({
  subject,
  preheader,
  blocks,
  onSubjectChange,
  onPreheaderChange,
  onUpdateBlock,
  onClose,
}: Props) {
  const { messages, sending, error, send, markResolved, resolvedToolIds, reset } = useCopilotChat({
    subject, preheader, blocks,
  })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (input.trim() === '' || sending) return
    send(input)
    setInput('')
  }

  const applyTool = (toolUseId: string, name: ToolName, input: Record<string, unknown>) => {
    const ok = applyToolToState(name, input, blocks, {
      onSubjectChange, onPreheaderChange, onUpdateBlock,
    })
    if (ok) markResolved(toolUseId)
  }

  const dismissTool = (toolUseId: string) => {
    markResolved(toolUseId)
  }

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--background-card)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          AI Co-Pilot
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={reset}
            className="border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
            title="Konversation zurücksetzen"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
            title="Co-Pilot schliessen"
          >
            ✕
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((m, i) => (
          <ChatBubble
            key={i}
            message={m}
            blocks={blocks}
            resolvedToolIds={resolvedToolIds}
            onApply={applyTool}
            onDismiss={dismissTool}
          />
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Co-Pilot denkt nach…
          </div>
        )}
        {error && (
          <div className="border border-rose-500/40 bg-rose-50 px-2 py-1 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="shrink-0 border-t border-[var(--border)] p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Frag mich nach Vorschlägen … (⌘+Enter senden)"
          rows={3}
          className="w-full resize-none border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-primary-400"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || input.trim() === ''}
          className="mt-1 w-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--background-card)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Senden
        </button>
      </form>
    </aside>
  )
}

interface ChatBubbleProps {
  message: { role: 'user' | 'assistant'; content: string | AssistantContent[] }
  blocks: NewsletterBlock[]
  resolvedToolIds: Set<string>
  onApply: (toolUseId: string, name: ToolName, input: Record<string, unknown>) => void
  onDismiss: (toolUseId: string) => void
}

function ChatBubble({ message, blocks, resolvedToolIds, onApply, onDismiss }: ChatBubbleProps) {
  if (message.role === 'user') {
    const text = typeof message.content === 'string' ? message.content : ''
    return (
      <div className="ml-6 border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text)]">
        {text}
      </div>
    )
  }
  const items = Array.isArray(message.content) ? message.content : []
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        if (item.type === 'text') {
          if (!item.text.trim()) return null
          return (
            <div key={i} className="text-xs text-[var(--text-secondary)]">
              {item.text}
            </div>
          )
        }
        if (item.type === 'tool_use') {
          const resolved = resolvedToolIds.has(item.id)
          return (
            <DiffCard
              key={item.id}
              name={item.name}
              input={item.input}
              blocks={blocks}
              resolved={resolved}
              onApply={() => onApply(item.id, item.name, item.input)}
              onDismiss={() => onDismiss(item.id)}
            />
          )
        }
        return null
      })}
    </div>
  )
}

interface DiffCardProps {
  name: ToolName
  input: Record<string, unknown>
  blocks: NewsletterBlock[]
  resolved: boolean
  onApply: () => void
  onDismiss: () => void
}

function DiffCard({ name, input, blocks, resolved, onApply, onDismiss }: DiffCardProps) {
  const display = describeTool(name, input, blocks)
  return (
    <div
      className={`border border-[var(--border)] bg-[var(--background)] p-2 text-xs ${
        resolved ? 'opacity-50' : ''
      }`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          {display.label}
        </span>
        {display.target && (
          <span className="truncate text-[9px] text-[var(--text-muted)]" title={display.target}>
            {display.target}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {display.before !== undefined && (
          <div className="border-l-2 border-rose-500/60 bg-rose-50/50 px-1.5 py-1 text-[var(--text-secondary)] dark:bg-rose-950/20">
            <span className="mr-1 text-rose-600 dark:text-rose-400">−</span>
            {display.before || <em className="opacity-60">(leer)</em>}
          </div>
        )}
        <div className="border-l-2 border-emerald-500/60 bg-emerald-50/50 px-1.5 py-1 text-[var(--text)] dark:bg-emerald-950/20">
          <span className="mr-1 text-emerald-600 dark:text-emerald-400">+</span>
          {display.after}
        </div>
      </div>
      {typeof input.rationale === 'string' && input.rationale.trim() !== '' && (
        <p className="mt-1 text-[10px] italic text-[var(--text-muted)]">{input.rationale}</p>
      )}
      <div className="mt-2 flex justify-end gap-1.5">
        {resolved ? (
          <span className="text-[10px] text-[var(--text-muted)]">Erledigt</span>
        ) : (
          <>
            <button
              type="button"
              onClick={onDismiss}
              className="border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              Verwerfen
            </button>
            <button
              type="button"
              onClick={onApply}
              className="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
            >
              Anwenden
            </button>
          </>
        )}
      </div>
    </div>
  )
}

interface ToolDisplay {
  label: string
  target?: string
  before?: string
  after: string
}

function describeTool(name: ToolName, input: Record<string, unknown>, blocks: NewsletterBlock[]): ToolDisplay {
  if (name === 'update_subject') {
    return {
      label: 'Subject ändern',
      after: String(input.subject ?? ''),
    }
  }
  if (name === 'update_preheader') {
    return {
      label: 'Preheader ändern',
      after: String(input.preheader ?? ''),
    }
  }
  if (name === 'update_text_block') {
    const blockId = String(input.blockId ?? '')
    const block = blocks.find((b): b is TextBlock => b.id === blockId && b.type === 'text')
    return {
      label: 'Textblock ersetzen',
      target: block ? `Block ${blockId}` : `Block ${blockId} (nicht gefunden)`,
      before: block?.content ?? '',
      after: String(input.content ?? ''),
    }
  }
  if (name === 'update_recap_label') {
    const blockId = String(input.blockId ?? '')
    const block = blocks.find((b): b is LastNewsletterBlock => b.id === blockId && b.type === 'last_newsletter')
    return {
      label: 'Recap-Label ändern',
      target: block ? `Block ${blockId}` : `Block ${blockId} (nicht gefunden)`,
      before: block?.recapLabel ?? '',
      after: String(input.label ?? ''),
    }
  }
  return { label: name, after: JSON.stringify(input) }
}

interface ApplyCallbacks {
  onSubjectChange: (s: string) => void
  onPreheaderChange: (s: string) => void
  onUpdateBlock: (index: number, updated: NewsletterBlock) => void
}

function applyToolToState(
  name: ToolName,
  input: Record<string, unknown>,
  blocks: NewsletterBlock[],
  cb: ApplyCallbacks,
): boolean {
  if (name === 'update_subject' && typeof input.subject === 'string') {
    cb.onSubjectChange(input.subject)
    return true
  }
  if (name === 'update_preheader' && typeof input.preheader === 'string') {
    cb.onPreheaderChange(input.preheader)
    return true
  }
  if (name === 'update_text_block' && typeof input.blockId === 'string' && typeof input.content === 'string') {
    const idx = blocks.findIndex((b) => b.id === input.blockId && b.type === 'text')
    if (idx === -1) return false
    const current = blocks[idx] as TextBlock
    cb.onUpdateBlock(idx, { ...current, content: input.content })
    return true
  }
  if (name === 'update_recap_label' && typeof input.blockId === 'string' && typeof input.label === 'string') {
    const idx = blocks.findIndex((b) => b.id === input.blockId && b.type === 'last_newsletter')
    if (idx === -1) return false
    const current = blocks[idx] as LastNewsletterBlock
    cb.onUpdateBlock(idx, { ...current, recapLabel: input.label })
    return true
  }
  return false
}
