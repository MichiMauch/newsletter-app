'use client'

import { useState } from 'react'
import type { NewsletterBlock } from '@/lib/newsletter-blocks'
import { formatDateShort, blockTypeLabels, type Post } from '../types'
import TiptapEditor from '../../TiptapEditor'
import PlaceholderHelp from '../../PlaceholderHelp'

export function DraggablePostItem({ post, isUsed }: { post: Post; isUsed: boolean }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', post.slug)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className={`flex cursor-grab items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background-card)] px-3 py-2 transition-all active:cursor-grabbing ${
        isUsed
          ? 'opacity-40'
          : 'hover:border-primary-400 dark:hover:border-primary-500'
      }`}
    >
      {post.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.image}
          alt=""
          className="h-12 w-12 shrink-0 rounded-md object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-xs text-[var(--text-muted)]">
          Bild
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--text)]">{post.title}</div>
        <div className="text-xs text-[var(--text-secondary)]">{formatDateShort(post.date)}</div>
      </div>
    </div>
  )
}

interface DropSlotProps {
  slug: string
  posts: Post[]
  onDrop: (slug: string) => void
  onClear: () => void
  label?: string
}

export function DropSlot({ slug, posts, onDrop, onClear, label }: DropSlotProps) {
  const [dragOver, setDragOver] = useState(false)
  const post = slug ? posts.find((p) => p.slug === slug) : null

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const droppedSlug = e.dataTransfer.getData('text/plain')
    if (droppedSlug) onDrop(droppedSlug)
  }

  if (post) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragEnter={() => setDragOver(true)}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 transition-colors ${
          dragOver
            ? 'border-primary-400 bg-primary-50/50 dark:border-primary-500 dark:bg-primary-900/20'
            : 'border-[var(--border)] bg-[var(--background-card)]'
        }`}
      >
        {label && (
          <div className="px-3 pt-2 text-xs font-medium text-[var(--text-secondary)]">{label}</div>
        )}
        <div className="flex items-center gap-3 p-3">
          {post.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-secondary)] text-xs text-[var(--text-muted)]">
              Bild
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[var(--text)]">{post.title}</div>
            <div className="text-xs text-[var(--text-secondary)]">{formatDateShort(post.date)}</div>
          </div>
          <button
            onClick={onClear}
            className="shrink-0 rounded-full bg-[var(--bg-secondary)] px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            title="Entfernen"
          >
            &times;
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={() => setDragOver(true)}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
        dragOver
          ? 'border-primary-400 bg-primary-50/50 text-primary-600 dark:border-primary-500 dark:bg-primary-900/20 dark:text-primary-400'
          : 'border-[var(--border)] text-[var(--text-secondary)]'
      }`}
    >
      {label && <div className="mb-1 text-xs font-medium">{label}</div>}
      <div className="text-sm">Artikel hierher ziehen</div>
    </div>
  )
}

interface SlotCardProps {
  block: NewsletterBlock
  index: number
  posts: Post[]
  allBlocks?: NewsletterBlock[]
  onUpdate: (updated: NewsletterBlock) => void
  onRemove?: () => void
  onMove: (from: number, to: number) => void
}

export function SlotCard({ block, index, posts, allBlocks, onUpdate, onRemove, onMove }: SlotCardProps) {
  const [generatingIntro, setGeneratingIntro] = useState(false)
  const [dragOver, setDragOver] = useState<'above' | 'below' | null>(null)

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('application/x-block-index', String(index))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('application/x-block-index')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    setDragOver(e.clientY < midY ? 'above' : 'below')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(null)
    const fromStr = e.dataTransfer.getData('application/x-block-index')
    if (!fromStr) return
    const from = Number(fromStr)
    const to = dragOver === 'above' ? index : index + 1
    const adjustedTo = from < to ? to - 1 : to
    onMove(from, adjustedTo)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(null)}
      onDrop={handleDrop}
      className={`relative rounded-xl border bg-[var(--background-card)] p-4 ${
        dragOver === 'above'
          ? 'border-t-primary-500 border-t-4 border-x-[var(--border)] border-b-[var(--border)] bg-primary-50/30 dark:bg-primary-900/10'
          : dragOver === 'below'
            ? 'border-b-primary-500 border-b-4 border-x-[var(--border)] border-t-[var(--border)] bg-primary-50/30 dark:bg-primary-900/10'
            : 'border-[var(--border)]'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="cursor-grab text-[var(--text-muted)] active:cursor-grabbing" title="Ziehen zum Umsortieren">&#x2807;</span>
          <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            {blockTypeLabels[block.type]}
          </span>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            title="Block entfernen"
          >
            &times;
          </button>
        )}
      </div>

      {block.type === 'hero' && (
        <DropSlot
          slug={block.slug}
          posts={posts}
          onDrop={(slug) => onUpdate({ ...block, slug })}
          onClear={() => onUpdate({ ...block, slug: '' })}
        />
      )}

      {block.type === 'link-list' && (
        <div className="space-y-2">
          {block.slugs.map((slug, i) => (
            <DropSlot
              key={i}
              slug={slug}
              posts={posts}
              onDrop={(newSlug) => {
                const newSlugs = [...block.slugs]
                newSlugs[i] = newSlug
                onUpdate({ ...block, slugs: newSlugs })
              }}
              onClear={() => {
                const newSlugs = block.slugs.filter((_, idx) => idx !== i)
                onUpdate({ ...block, slugs: newSlugs })
              }}
              label={`Artikel ${i + 1}`}
            />
          ))}
          <button
            onClick={() => onUpdate({ ...block, slugs: [...block.slugs, ''] })}
            className="w-full rounded-xl border-2 border-dashed border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
          >
            + Artikel hinzufügen
          </button>
        </div>
      )}

      {block.type === 'text' && (
        <div>
          <TiptapEditor
            content={block.content}
            onChange={(html) => onUpdate({ ...block, content: html })}
            placeholder="Freitext eingeben…"
          />
          <PlaceholderHelp />
          {allBlocks && (
            <button
              onClick={async () => {
                setGeneratingIntro(true)
                try {
                  const bySlug = new Map<string, Post>()
                  for (const p of posts) bySlug.set(p.slug, p)
                  const postData: Array<{ title: string; summary: string }> = []
                  for (const b of allBlocks) {
                    if (b.type === 'hero' && b.slug) {
                      const p = bySlug.get(b.slug)
                      if (p) postData.push({ title: p.title, summary: p.summary })
                    }
                    if (b.type === 'link-list') {
                      for (const s of b.slugs) {
                        const p = bySlug.get(s)
                        if (p) postData.push({ title: p.title, summary: p.summary })
                      }
                    }
                  }
                  if (postData.length === 0) return
                  const res = await fetch('/api/admin/ai-generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'intro', posts: postData }),
                  })
                  if (!res.ok) throw new Error('Fehler')
                  const data = await res.json()
                  if (data.text) onUpdate({ ...block, content: `<p>${data.text}</p>` })
                } catch (err) {
                  console.error('[AI intro]', err)
                } finally {
                  setGeneratingIntro(false)
                }
              }}
              disabled={generatingIntro}
              className="mt-2 flex items-center gap-1.5 text-xs text-primary-600 hover:underline disabled:opacity-50"
            >
              {generatingIntro ? (
                <span className="animate-pulse">Generiere…</span>
              ) : (
                <>
                  <span>✨</span>
                  <span>Mit AI ausfüllen</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
