'use client'

import { useState, useEffect, useRef } from 'react'
import type { SiteConfig } from '@/lib/site-config'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'
import { buildMultiBlockNewsletterHtml } from '@/lib/newsletter-template'
import TiptapEditor from '@/components/TiptapEditor'
import type {
  NodeType,
  NodeConfig,
  TriggerNodeConfig,
  DelayNodeConfig,
  EmailNodeConfig,
  LastNewsletterNodeConfig,
  ConditionNodeConfig,
  TagNodeConfig,
  TriggerType,
  ConditionType,
  TagAction,
} from '@/lib/graph-types'
import { NODE_TYPE_LABELS, CONDITION_TYPE_LABELS } from '@/lib/graph-types'

interface Post {
  slug: string; title: string; summary: string; image: string | null; date: string
}

const inputCls = 'w-full border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--color-primary)] focus:ring-0'
const labelCls = 'mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]'
const btnPrimary = 'bg-primary-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-50'
const btnSecondary = 'border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]'

export default function NodeConfigPanel({
  nodeId,
  nodeType,
  config,
  posts,
  siteConfig,
  onSave,
  onDelete,
  onClose,
}: {
  nodeId: string
  nodeType: NodeType
  config: NodeConfig
  posts: Post[]
  siteConfig: SiteConfig
  onSave: (config: NodeConfig) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [localConfig, setLocalConfig] = useState<NodeConfig>(config)
  const [prevNodeId, setPrevNodeId] = useState(nodeId)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset local config when switching nodes — adjust state during render
  // instead of in an effect (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  if (nodeId !== prevNodeId) {
    setPrevNodeId(nodeId)
    setLocalConfig(config)
  }

  // Debounced auto-save: only fires on user-initiated changes
  const updateConfig = (newConfig: NodeConfig) => {
    setLocalConfig(newConfig)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => onSave(newConfig), 500)
  }

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  return (
    <div className="flex h-full flex-col border-l border-[var(--border)] bg-[var(--background-card)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">{NODE_TYPE_LABELS[nodeType]}</h3>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {nodeType === 'trigger' && <TriggerConfigFields config={localConfig as TriggerNodeConfig} onChange={updateConfig as (c: TriggerNodeConfig) => void} />}
        {nodeType === 'delay' && <DelayConfigFields config={localConfig as DelayNodeConfig} onChange={updateConfig as (c: DelayNodeConfig) => void} />}
        {nodeType === 'email' && <EmailConfigFields config={localConfig as EmailNodeConfig} onChange={updateConfig as (c: EmailNodeConfig) => void} posts={posts} siteConfig={siteConfig} />}
        {nodeType === 'last_newsletter' && <LastNewsletterConfigFields config={localConfig as LastNewsletterNodeConfig} onChange={updateConfig as (c: LastNewsletterNodeConfig) => void} />}
        {nodeType === 'condition' && <ConditionConfigFields config={localConfig as ConditionNodeConfig} onChange={updateConfig as (c: ConditionNodeConfig) => void} />}
        {nodeType === 'tag' && <TagConfigFields config={localConfig as TagNodeConfig} onChange={updateConfig as (c: TagNodeConfig) => void} />}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3">
        <button onClick={onClose} className={btnSecondary}>Schliessen</button>
        {nodeType !== 'trigger' && (
          <button onClick={onDelete} className="ml-auto text-xs text-red-500 hover:text-red-700">Löschen</button>
        )}
      </div>
    </div>
  )
}

// ─── Per-type Config Fields ────────────────────────────────────────────

const TRIGGER_TYPES: { key: TriggerType; label: string; desc: string }[] = [
  { key: 'subscriber_confirmed', label: 'Nach Bestätigung', desc: 'Double-Opt-In bestätigt' },
  { key: 'manual', label: 'Manuell', desc: 'Admin schreibt ein' },
  { key: 'no_activity_days', label: 'Inaktivität', desc: 'Kein Klick nach X Tagen' },
  { key: 'link_clicked', label: 'Nach Klick', desc: 'Link im Newsletter geklickt' },
  { key: 'engagement_below', label: 'Engagement-Drop', desc: 'Score unter Schwelle' },
]

function TriggerConfigFields({ config, onChange }: { config: TriggerNodeConfig; onChange: (c: TriggerNodeConfig) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Trigger-Typ</label>
        <div className="grid grid-cols-2 gap-2">
          {TRIGGER_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => onChange({ ...config, trigger_type: t.key })}
              className={`border p-2 text-left transition-colors ${
                config.trigger_type === t.key ? 'border-[var(--color-primary)] bg-primary-50 dark:bg-primary-900/10' : 'border-[var(--border)] hover:border-[var(--text-secondary)]'
              }`}
            >
              <div className="text-xs font-semibold text-[var(--text)]">{t.label}</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {config.trigger_type === 'no_activity_days' && (
        <div>
          <label className={labelCls}>Nach X Tagen Inaktivität</label>
          <input type="number" min={1} value={config.days ?? 30} onChange={(e) => onChange({ ...config, days: Number(e.target.value) })} className={inputCls + ' w-32'} />
        </div>
      )}
      {config.trigger_type === 'link_clicked' && (
        <div>
          <label className={labelCls}>URL enthält (leer = beliebig)</label>
          <input type="text" value={config.url_contains ?? ''} onChange={(e) => onChange({ ...config, url_contains: e.target.value })} placeholder="/pricing" className={inputCls} />
        </div>
      )}
      {config.trigger_type === 'engagement_below' && (
        <div>
          <label className={labelCls}>Score-Schwelle (0–100)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={config.threshold ?? 20}
            onChange={(e) => onChange({ ...config, threshold: Number(e.target.value) })}
            className={inputCls + ' w-32'}
          />
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            Empfehlung: 20 = dormant. 30 = moderate. Score wird täglich um 03:00 UTC neu berechnet.
          </p>
        </div>
      )}
    </div>
  )
}

function DelayConfigFields({ config, onChange }: { config: DelayNodeConfig; onChange: (c: DelayNodeConfig) => void }) {
  const hours = config.delay_hours
  const [value, unit] = (() => {
    if (hours >= 24 * 7 && hours % (24 * 7) === 0) return [hours / (24 * 7), 'weeks' as const]
    if (hours >= 24 && hours % 24 === 0) return [hours / 24, 'days' as const]
    return [hours, 'hours' as const]
  })()

  const updateDelay = (v: number, u: 'hours' | 'days' | 'weeks') => {
    const h = u === 'weeks' ? v * 24 * 7 : u === 'days' ? v * 24 : v
    onChange({ delay_hours: h })
  }

  return (
    <div>
      <label className={labelCls}>Verzögerung</label>
      <div className="flex gap-2">
        <input type="number" min={0} value={value} onChange={(e) => updateDelay(Number(e.target.value), unit)} className={inputCls + ' w-24'} />
        <select value={unit} onChange={(e) => updateDelay(value, e.target.value as 'hours' | 'days' | 'weeks')} className={inputCls + ' w-32'}>
          <option value="hours">Stunden</option>
          <option value="days">Tage</option>
          <option value="weeks">Wochen</option>
        </select>
      </div>
    </div>
  )
}

function EmailConfigFields({ config, onChange, posts, siteConfig }: {
  config: EmailNodeConfig; onChange: (c: EmailNodeConfig) => void; posts: Post[]; siteConfig: SiteConfig
}) {
  const [blocks, setBlocks] = useState<NewsletterBlock[]>(() => {
    try { return JSON.parse(config.blocks_json || '[]') } catch { return [] }
  })
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    onChange({ ...config, blocks_json: JSON.stringify(blocks) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks])

  const updateBlock = (i: number, b: NewsletterBlock) => { const n = [...blocks]; n[i] = b; setBlocks(n) }
  const removeBlock = (i: number) => setBlocks(blocks.filter((_, idx) => idx !== i))
  const addBlock = (type: NewsletterBlock['type']) => {
    const id = crypto.randomUUID()
    let block: NewsletterBlock
    switch (type) {
      case 'hero': block = { id, type: 'hero', slug: '' }; break
      case 'text': block = { id, type: 'text', content: '' }; break
      case 'link-list': block = { id, type: 'link-list', slugs: [] }; break
      case 'last_newsletter': block = { id, type: 'last_newsletter' }; break
      default: return
    }
    setBlocks([...blocks, block])
  }

  const postsMap: Record<string, PostRef> = {}
  for (const p of posts) postsMap[p.slug] = p
  const previewHtml = showPreview ? buildMultiBlockNewsletterHtml(siteConfig, blocks, postsMap, '#') : ''

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Betreffzeile</label>
        <input type="text" value={config.subject} onChange={(e) => onChange({ ...config, subject: e.target.value })} placeholder="Betreff…" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Inhalt</label>
        <div className="space-y-2">
          {blocks.map((block, i) => (
            <div key={block.id} className="border border-[var(--border)] p-3">
              <div className="flex items-start justify-between mb-2">
                <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                  {block.type === 'hero' ? 'Hero' : block.type === 'text' ? 'Freitext' : block.type === 'link-list' ? 'Link-Liste' : 'Letzter NL'}
                </span>
                <button onClick={() => removeBlock(i)} className="text-xs text-red-500 hover:text-red-700">✕</button>
              </div>
              {block.type === 'hero' && (
                <select value={block.slug} onChange={(e) => updateBlock(i, { ...block, slug: e.target.value })} className={inputCls}>
                  <option value="">Beitrag wählen…</option>
                  {posts.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
                </select>
              )}
              {block.type === 'text' && <TiptapEditor content={block.content} onChange={(html) => updateBlock(i, { ...block, content: html })} placeholder="Freitext…" />}
              {block.type === 'link-list' && (
                <div className="space-y-1">
                  {block.slugs.map((slug, si) => (
                    <div key={si} className="flex gap-1">
                      <select value={slug} onChange={(e) => { const n = [...block.slugs]; n[si] = e.target.value; updateBlock(i, { ...block, slugs: n }) }} className={inputCls + ' flex-1'}>
                        <option value="">Beitrag wählen…</option>
                        {posts.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
                      </select>
                      <button onClick={() => updateBlock(i, { ...block, slugs: block.slugs.filter((_, x) => x !== si) })} className="px-2 text-xs text-red-500">✕</button>
                    </div>
                  ))}
                  <button onClick={() => updateBlock(i, { ...block, slugs: [...block.slugs, ''] })} className="text-xs text-primary-600 hover:underline">+ Link</button>
                </div>
              )}
              {block.type === 'last_newsletter' && <div className="text-xs text-[var(--text-secondary)]">Wird automatisch befüllt.</div>}
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            <button onClick={() => addBlock('hero')} className="border border-dashed border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-primary-400 hover:text-primary-600">+ Hero</button>
            <button onClick={() => addBlock('text')} className="border border-dashed border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-primary-400 hover:text-primary-600">+ Freitext</button>
            <button onClick={() => addBlock('link-list')} className="border border-dashed border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-primary-400 hover:text-primary-600">+ Link-Liste</button>
            {!blocks.some((b) => b.type === 'last_newsletter') && (
              <button onClick={() => addBlock('last_newsletter')} className="border border-dashed border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-amber-400 hover:text-amber-600">+ Letzter NL</button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setShowPreview(!showPreview)} className={btnSecondary + ' text-xs'}>
          {showPreview ? 'Vorschau aus' : 'Vorschau'}
        </button>
      </div>
      {showPreview && (
        <div className="border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}
    </div>
  )
}

function LastNewsletterConfigFields({ config, onChange }: { config: LastNewsletterNodeConfig; onChange: (c: LastNewsletterNodeConfig) => void }) {
  return (
    <div className="space-y-4">
      <div className="border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <div className="text-xs text-[var(--text-secondary)]">
          Sendet automatisch den neuesten Newsletter an den Abonnenten.
        </div>
      </div>
      <div>
        <label className={labelCls}>Betreff überschreiben (optional)</label>
        <input
          type="text"
          value={config.subject_override ?? ''}
          onChange={(e) => onChange({ ...config, subject_override: e.target.value || undefined })}
          placeholder="Leer = Betreff des letzten Newsletters"
          className={inputCls}
        />
      </div>
    </div>
  )
}

const CONDITION_TYPES: ConditionType[] = ['has_tag', 'clicked_link', 'opened_email']

function ConditionConfigFields({ config, onChange }: { config: ConditionNodeConfig; onChange: (c: ConditionNodeConfig) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Bedingungstyp</label>
        <select value={config.condition_type} onChange={(e) => onChange({ ...config, condition_type: e.target.value as ConditionType })} className={inputCls}>
          {CONDITION_TYPES.map((t) => <option key={t} value={t}>{CONDITION_TYPE_LABELS[t]}</option>)}
        </select>
      </div>
      {config.condition_type === 'has_tag' && (
        <div>
          <label className={labelCls}>Tag</label>
          <input type="text" value={config.tag ?? ''} onChange={(e) => onChange({ ...config, tag: e.target.value })} placeholder="z.B. vip-kunde" className={inputCls} />
        </div>
      )}
      {(config.condition_type === 'clicked_link' || config.condition_type === 'opened_email') && (
        <div>
          <label className={labelCls}>URL enthält</label>
          <input type="text" value={config.url_contains ?? ''} onChange={(e) => onChange({ ...config, url_contains: e.target.value })} placeholder="leer = beliebig" className={inputCls} />
        </div>
      )}
      <div className="border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-[10px] text-[var(--text-secondary)]">
        Der Node verzweigt in zwei Pfade: <strong className="text-emerald-600">ja</strong> wenn die Bedingung zutrifft, <strong className="text-red-500">nein</strong> wenn nicht.
      </div>
    </div>
  )
}

const TAG_ACTIONS: { key: TagAction; label: string }[] = [
  { key: 'add', label: 'Hinzufügen' },
  { key: 'remove', label: 'Entfernen' },
]

function TagConfigFields({ config, onChange }: { config: TagNodeConfig; onChange: (c: TagNodeConfig) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Aktion</label>
        <div className="flex gap-2">
          {TAG_ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => onChange({ ...config, action: a.key })}
              className={`border px-4 py-2 text-xs font-medium transition-colors ${
                config.action === a.key ? 'border-[var(--color-primary)] bg-primary-50 text-primary-700 dark:bg-primary-900/10 dark:text-primary-300' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelCls}>Tag</label>
        <input type="text" value={config.tag} onChange={(e) => onChange({ ...config, tag: e.target.value })} placeholder="z.B. vip-kunde" className={inputCls} />
      </div>
    </div>
  )
}
