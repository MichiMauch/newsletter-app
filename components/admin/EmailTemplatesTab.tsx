'use client'

import { useState } from 'react'
import { TEMPLATE_LIST, type TemplateKey } from '@/lib/email-template-registry'

type Format = 'html' | 'text'
type Viewport = 'desktop' | 'mobile'

export default function EmailTemplatesTab() {
  const [selected, setSelected] = useState<TemplateKey>(TEMPLATE_LIST[0].key)
  const [format, setFormat] = useState<Format>('html')
  const [viewport, setViewport] = useState<Viewport>('desktop')

  const previewUrl = `/api/admin/email-preview?template=${selected}&format=${format}`
  const current = TEMPLATE_LIST.find((t) => t.key === selected)

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col gap-4 p-6">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)]">E-Mail-Templates</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Live-Preview aller Templates mit Beispiel-Daten. Server-gerendert mit demselben Code,
          den auch der echte Versand verwendet.
        </p>
      </div>

      <div className="grid flex-1 grid-cols-[260px_1fr] gap-4 overflow-hidden">
        {/* Sidebar: Template list */}
        <aside className="glass-card flex flex-col overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Templates
            </h3>
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {TEMPLATE_LIST.map((t) => (
              <li key={t.key}>
                <button
                  onClick={() => setSelected(t.key)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selected === t.key
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                      : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]'
                  }`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{t.description}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main: Preview */}
        <section className="glass-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
            <div className="text-sm font-medium text-[var(--text)]">{current?.label}</div>
            <div className="flex items-center gap-2">
              <ToggleGroup
                value={viewport}
                options={[
                  { value: 'desktop', label: 'Desktop' },
                  { value: 'mobile', label: 'Mobile' },
                ]}
                onChange={setViewport}
              />
              <ToggleGroup
                value={format}
                options={[
                  { value: 'html', label: 'HTML' },
                  { value: 'text', label: 'Plain-Text' },
                ]}
                onChange={setFormat}
              />
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-[var(--text)]"
              >
                Im neuen Tab
              </a>
            </div>
          </div>
          <div className="flex flex-1 items-start justify-center overflow-auto bg-[var(--bg-secondary)] p-4">
            <iframe
              key={`${selected}-${format}-${viewport}`}
              src={previewUrl}
              title={`Preview: ${current?.label}`}
              className="border border-[var(--border)] bg-white shadow-sm"
              style={{
                width: viewport === 'mobile' ? 375 : 640,
                height: '100%',
                minHeight: 600,
              }}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-[var(--border)]">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-[11px] font-medium transition-colors ${
            value === opt.value
              ? 'bg-[var(--text)] text-[var(--background-card)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
