'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { SiteConfig } from '@/lib/site-config'
import type { Automation } from './automation/types'
import type { GraphNode, GraphEdge } from '@/lib/graph-types'
import ConfirmModal from './ConfirmModal'
import { AUTOMATION_PRESETS, type AutomationPreset } from './automation/presets'
import { useToast } from './ui/ToastProvider'

// React Flow is heavy — load client-side only
const GraphEditor = dynamic(() => import('./automation/graph/GraphEditor'), { ssr: false })

interface Post {
  slug: string; title: string; summary: string; image: string | null; date: string
}

const btnPrimary = 'bg-primary-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-50'
const btnSecondary = 'border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]'

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error: ${res.status}`)
  }
  return res.json()
}

const TRIGGER_LABELS_SHORT: Record<string, string> = {
  subscriber_confirmed: 'Nach Bestätigung',
  manual: 'Manuell',
  no_activity_days: 'Inaktivität',
  link_clicked: 'Link-Klick',
}

export default function AutomationEditor({ posts, siteConfig, onFullscreen, initialAutomationId }: { posts: Post[]; siteConfig: SiteConfig; onFullscreen?: (isFullscreen: boolean) => void; initialAutomationId?: number }) {
  const router = useRouter()
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(initialAutomationId ?? null)
  const [automation, setAutomation] = useState<Automation | null>(null)
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([])
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([])
  const [editName, setEditName] = useState('')
  const toast = useToast()
  const [testing, setTesting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)

  async function loadList() {
    setLoading(true)
    try {
      const data = await api('GET', '/api/admin/automations?list=1')
      setAutomations(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      setAutomations([])
    }
    setLoading(false)
  }

  async function loadAutomation(id: number) {
    try {
      const [info, graph] = await Promise.all([
        api('GET', `/api/admin/automations?id=${id}`),
        api('GET', `/api/admin/automations/${id}/graph`),
      ])
      setAutomation(info.automation)
      setEditName(info.automation.name)
      setGraphNodes(graph.nodes || [])
      setGraphEdges(graph.edges || [])
      setSelectedId(id)
      onFullscreen?.(true)
    } catch (err) {
      console.error(err)
      toast.error('Automation konnte nicht geladen werden')
    }
  }

  useEffect(() => {
    loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (initialAutomationId) loadAutomation(initialAutomationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAutomationId])

  const handleUpdateName = async () => {
    if (!automation || editName === automation.name) return
    await api('POST', '/api/admin/automations', { action: 'update', id: automation.id, name: editName })
    setAutomation({ ...automation, name: editName })
    loadList()
  }

  const handleToggleActive = async () => {
    if (!automation) return
    const newActive = automation.active ? 0 : 1
    await api('POST', '/api/admin/automations', { action: 'toggle-active', id: automation.id, active: newActive })
    setAutomation({ ...automation, active: newActive })
    loadList()
  }

  const handleDelete = () => {
    if (!automation) return
    setConfirmAction({
      title: 'Automation löschen',
      message: `"${automation.name}" wirklich löschen? Alle Nodes und Abonnenten werden gelöscht.`,
      onConfirm: async () => {
        await api('POST', '/api/admin/automations', { action: 'delete', id: automation.id })
        setSelectedId(null)
        setAutomation(null)
        onFullscreen?.(false)
        setConfirmAction(null)
        loadList()
      },
    })
  }

  const handleTest = async () => {
    if (!selectedId || testing) return
    setTesting(true)
    try {
      const result = await api('POST', '/api/admin/automations', { action: 'test-automation', automation_id: selectedId })
      toast.success(result.message || 'Testmail gesendet')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    }
    setTesting(false)
  }

  const handleToggleActiveInList = async (id: number, current: number) => {
    await api('POST', '/api/admin/automations', { action: 'toggle-active', id, active: current ? 0 : 1 })
    loadList()
  }

  const [creating, setCreating] = useState(false)
  const [showPresetPicker, setShowPresetPicker] = useState(false)

  const handleCreateFromPreset = async (preset: AutomationPreset) => {
    if (creating) return
    setCreating(true)
    setShowPresetPicker(false)
    try {
      const body: Record<string, unknown> = {
        action: 'create-from-wizard',
        name: preset.defaultName || 'Neue Automatisierung',
        trigger_type: preset.trigger,
        trigger_config: JSON.stringify(preset.triggerConfig ?? {}),
      }
      if (preset.graph) {
        body.preset_graph = preset.graph
      } else {
        body.steps = preset.steps
      }
      const result = await api('POST', '/api/admin/automations', body)
      router.push(`/admin/newsletter/automations/${result.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    }
    setCreating(false)
  }

  const handleCreateNew = () => setShowPresetPicker(true)

  // ── List ─────────────────────────────────────────────────────────────
  if (!selectedId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">Automatisierungen</h3>
          <button onClick={handleCreateNew} disabled={creating} className={btnPrimary}>{creating ? 'Erstellen…' : 'Neue Automatisierung'}</button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-[var(--text-secondary)]">Laden…</div>
        ) : automations.length === 0 ? (
          <div className="border border-dashed border-[var(--border)] p-8 text-center">
            <div className="text-sm text-[var(--text-secondary)]">Noch keine Automatisierungen erstellt.</div>
            <button onClick={handleCreateNew} disabled={creating} className="mt-3 text-sm font-medium text-primary-600 hover:underline">
              Erste Automatisierung erstellen
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {automations.map((a) => (
              <div key={a.id} className="flex items-center gap-4 border border-[var(--border)] bg-[var(--background-card)] p-5 transition-colors hover:border-[var(--text-secondary)]">
                <Link href={`/admin/newsletter/automations/${a.id}`} className="min-w-0 flex-1 text-left">
                  <div className="font-medium text-[var(--text)]">{a.name}</div>
                  <div className="mt-2 flex gap-3 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                    <span>{TRIGGER_LABELS_SHORT[a.trigger_type] || a.trigger_type}</span>
                    <span>·</span>
                    <span>{a.step_count} Node{a.step_count !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>{a.enrollment_count} Abonnent{a.enrollment_count !== 1 ? 'en' : ''}</span>
                  </div>
                </Link>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleActiveInList(a.id, a.active) }}
                  className="relative h-6 w-11 shrink-0 transition-colors"
                  style={{ background: a.active ? 'var(--color-primary)' : 'var(--border)' }}
                >
                  <span className="absolute top-0.5 h-5 w-5 bg-white transition-all" style={{ left: a.active ? 'calc(100% - 22px)' : '2px' }} />
                </button>
              </div>
            ))}
          </div>
        )}
        {showPresetPicker && (
          <div
            className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowPresetPicker(false)}
          >
            <div
              className="w-full max-w-2xl border border-[var(--border)] bg-[var(--background-card)] p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--text)]">Vorlage wählen</h3>
                <button
                  onClick={() => setShowPresetPicker(false)}
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
                >
                  ✕
                </button>
              </div>
              <div className="grid gap-3">
                {AUTOMATION_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleCreateFromPreset(p)}
                    disabled={creating}
                    className="border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-left transition-colors hover:border-[var(--color-primary)] disabled:opacity-50"
                  >
                    <div className="font-medium text-[var(--text)]">{p.label}</div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">{p.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Editor ───────────────────────────────────────────────────────────
  return (
    <div className="h-full">
      {selectedId && (
        <GraphEditor
          automationId={selectedId}
          initialNodes={graphNodes}
          initialEdges={graphEdges}
          posts={posts}
          siteConfig={siteConfig}
          onSaved={() => toast.success('Graph gespeichert')}
          toolbar={{
            name: editName,
            active: automation?.active ?? 0,
            testing,
            onNameChange: setEditName,
            onNameBlur: handleUpdateName,
            onBack: () => { setSelectedId(null); setAutomation(null); onFullscreen?.(false); router.push('/admin/newsletter/automations'); loadList() },
            onDelete: handleDelete,
            onTest: handleTest,
            onToggleActive: handleToggleActive,
          }}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
