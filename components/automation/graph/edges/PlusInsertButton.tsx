'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NodeType } from '@/lib/graph-types'

interface PlusInsertButtonProps {
  types: { key: NodeType; label: string }[]
  onSelect: (type: NodeType) => void
}

export default function PlusInsertButton({ types, onSelect }: PlusInsertButtonProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ left: r.left + r.width / 2, top: r.bottom + 4 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="flex h-6 w-6 items-center justify-center border border-[var(--border)] bg-[var(--background-card)] text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        aria-label="Node einfügen"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
          className="border border-[var(--border)] bg-[var(--background-card)] shadow-lg"
        >
          {types.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(t.key)
                setOpen(false)
              }}
              className="block w-full whitespace-nowrap px-4 py-2 text-left text-xs hover:bg-[var(--bg-secondary)]"
            >
              {t.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
