'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { useEffect, useState } from 'react'
import PlaceholderMenu from './PlaceholderMenu'

interface TiptapEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
}

/**
 * Converts legacy plain text (with \n) to simple HTML paragraphs.
 * If content already contains HTML tags, returns as-is.
 */
function normalizeContent(content: string): string {
  if (!content) return ''
  // Already HTML?
  if (/<[a-z][\s\S]*>/i.test(content)) return content
  // Convert plain text → HTML paragraphs
  return content
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export default function TiptapEditor({ content, onChange, placeholder }: TiptapEditorProps) {
  const [linkInput, setLinkInput] = useState<string | null>(null)
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary-600 underline' },
      }),
    ],
    content: normalizeContent(content),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none outline-none min-h-[80px] px-4 py-3 text-sm text-[var(--text)]',
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML())
    },
  })

  // Sync external content changes (e.g. when switching blocks)
  useEffect(() => {
    if (!editor) return
    const normalized = normalizeContent(content)
    if (editor.getHTML() !== normalized) {
      editor.commands.setContent(normalized)
    }
  }, [content, editor])

  if (!editor) return null

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-secondary)]">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 border-b border-[var(--border)] px-2 py-1.5">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Fett"
        >
          B
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Kursiv"
        >
          <em>I</em>
        </ToolbarButton>
        <div className="mx-1 w-px bg-[var(--border)]" />
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Überschrift"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Aufzählung"
        >
          •
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Nummerierung"
        >
          1.
        </ToolbarButton>
        <div className="mx-1 w-px bg-[var(--border)]" />
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run()
              return
            }
            setLinkInput('')
          }}
          title="Link"
        >
          &#128279;
        </ToolbarButton>
        {linkInput !== null && (
          <div className="flex items-center gap-1">
            <input
              type="url"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && linkInput) {
                  editor.chain().focus().setLink({ href: linkInput }).run()
                  setLinkInput(null)
                }
                if (e.key === 'Escape') setLinkInput(null)
              }}
              placeholder="https://…"
              autoFocus
              className="h-7 w-40 border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs text-[var(--text)] outline-none focus:border-[var(--color-primary)]"
            />
            <button
              onClick={() => {
                if (linkInput) editor.chain().focus().setLink({ href: linkInput }).run()
                setLinkInput(null)
              }}
              className="h-7 px-2 text-xs text-primary-600 hover:text-primary-700"
            >
              OK
            </button>
            <button
              onClick={() => setLinkInput(null)}
              className="h-7 px-1 text-xs text-[var(--text-muted)]"
            >
              ✕
            </button>
          </div>
        )}
        <div className="mx-1 w-px bg-[var(--border)]" />
        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Zitat"
        >
          &ldquo;
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Trennlinie"
        >
          —
        </ToolbarButton>
        <div className="mx-1 w-px bg-[var(--border)]" />
        <PlaceholderMenu
          variant="toolbar"
          onInsert={(syntax) => editor.chain().focus().insertContent(syntax).run()}
        />
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Placeholder */}
      {editor.isEmpty && placeholder && (
        <div className="pointer-events-none -mt-10 px-4 py-3 text-sm text-[var(--text-muted)]">
          {placeholder}
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-7 min-w-[28px] items-center justify-center px-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  )
}
