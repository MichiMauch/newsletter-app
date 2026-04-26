'use client'

import { useState } from 'react'
import type { NewsletterBlock, NewsletterTemplate } from '@/lib/newsletter-blocks'
import { blockTypeLabels, inputCls } from '../types'

interface TemplateBuilderProps {
  onSave: (template: NewsletterTemplate) => void
  onCancel: () => void
}

export default function TemplateBuilder({ onSave, onCancel }: TemplateBuilderProps) {
  const [name, setName] = useState('')
  const [slots, setSlots] = useState<{ type: NewsletterBlock['type'] }[]>([])

  function addSlot(type: NewsletterBlock['type']) {
    setSlots([...slots, { type }])
  }

  function removeSlot(index: number) {
    setSlots(slots.filter((_, i) => i !== index))
  }

  function moveSlot(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= slots.length) return
    const next = [...slots]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSlots(next)
  }

  function handleSave() {
    if (!name.trim() || slots.length === 0) return
    onSave({
      id: crypto.randomUUID(),
      name: name.trim(),
      slots,
    })
  }

  const toolbarBtnCls =
    'rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400'

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-[var(--text)]">Neues Template erstellen</h3>

      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--text)]">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mein Newsletter-Layout"
          className={inputCls}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--text)]">Blöcke hinzufügen</label>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => addSlot('hero')} className={toolbarBtnCls}>+ Hero</button>
          <button onClick={() => addSlot('text')} className={toolbarBtnCls}>+ Freitext</button>
          <button onClick={() => addSlot('link-list')} className={toolbarBtnCls}>+ Link-Liste</button>
        </div>
      </div>

      {slots.length > 0 && (
        <div className="space-y-2">
          {slots.map((slot, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--background-card)] px-4 py-2.5"
            >
              <span className="text-sm font-medium text-[var(--text)]">
                {i + 1}. {blockTypeLabels[slot.type]}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => moveSlot(i, -1)}
                  disabled={i === 0}
                  className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30"
                >
                  &uarr;
                </button>
                <button
                  onClick={() => moveSlot(i, 1)}
                  disabled={i === slots.length - 1}
                  className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30"
                >
                  &darr;
                </button>
                <button
                  onClick={() => removeSlot(i)}
                  className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {slots.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-6 text-center text-sm text-[var(--text-secondary)]">
          Füge oben Block-Typen hinzu, um dein Template zu definieren.
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || slots.length === 0}
          className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md disabled:opacity-50"
        >
          Template speichern
        </button>
      </div>
    </div>
  )
}
