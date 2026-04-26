'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  createdAt: number
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  activity: Toast[]
  activityCount: number
  clearActivity: () => void
  isOverlayOpen: boolean
  pushOverlay: () => void
  popOverlay: () => void
  isActivityOpen: boolean
  toggleActivity: () => void
  closeActivity: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)
const ACTIVITY_KEY = 'newsletter-activity-log'
const ACTIVITY_LIMIT = 50
const TOAST_DURATION = 5000

function loadActivity(): Toast[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveActivity(entries: Toast[]) {
  try {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(entries.slice(0, ACTIVITY_LIMIT)))
  } catch {
    /* quota exceeded — silently ignore */
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Toast[]>([])
  // Lazy initializer: read localStorage during state init instead of in
  // a mount effect — avoids a cascading re-render and keeps lint happy.
  const [activity, setActivity] = useState<Toast[]>(loadActivity)
  const [overlayCount, setOverlayCount] = useState(0)
  const [activityOpen, setActivityOpen] = useState(false)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setActive((curr) => curr.filter((t) => t.id !== id))
    const handle = timers.current.get(id)
    if (handle) {
      clearTimeout(handle)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback((type: ToastType, message: string) => {
    const entry: Toast = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random()}`,
      type,
      message,
      createdAt: Date.now(),
    }
    setActive((curr) => [...curr, entry])
    setActivity((curr) => {
      const next = [entry, ...curr].slice(0, ACTIVITY_LIMIT)
      saveActivity(next)
      return next
    })
    const handle = setTimeout(() => dismiss(entry.id), TOAST_DURATION)
    timers.current.set(entry.id, handle)
  }, [dismiss])

  useEffect(() => {
    const handles = timers.current
    return () => {
      handles.forEach((h) => clearTimeout(h))
      handles.clear()
    }
  }, [])

  const clearActivity = useCallback(() => {
    setActivity([])
    saveActivity([])
  }, [])

  const pushOverlay = useCallback(() => setOverlayCount((c) => c + 1), [])
  const popOverlay = useCallback(() => setOverlayCount((c) => Math.max(0, c - 1)), [])

  const toggleActivity = useCallback(() => setActivityOpen((o) => !o), [])
  const closeActivity = useCallback(() => setActivityOpen(false), [])

  const value = useMemo<ToastContextValue>(() => ({
    toast,
    success: (m) => toast('success', m),
    error: (m) => toast('error', m),
    info: (m) => toast('info', m),
    activity,
    activityCount: activity.length,
    clearActivity,
    isOverlayOpen: overlayCount > 0,
    pushOverlay,
    popOverlay,
    isActivityOpen: activityOpen,
    toggleActivity,
    closeActivity,
  }), [toast, activity, clearActivity, overlayCount, pushOverlay, popOverlay, activityOpen, toggleActivity, closeActivity])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={active} onDismiss={dismiss} />
      {activityOpen && overlayCount === 0 && (
        <ActivityLogPanel
          activity={activity}
          onClear={clearActivity}
          onClose={closeActivity}
        />
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

// ─── Toast Viewport ────────────────────────────────────────────────────

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const styles =
    toast.type === 'success'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100'
      : toast.type === 'error'
        ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100'
        : 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100'
  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full max-w-md items-start gap-3 border px-4 py-3 shadow-lg backdrop-blur-md ${styles}`}
    >
      <ToastIcon type={toast.type} />
      <span className="flex-1 text-sm font-medium leading-5">{toast.message}</span>
      <button
        onClick={onDismiss}
        aria-label="Schliessen"
        className="ml-1 shrink-0 opacity-60 transition-opacity hover:opacity-100"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  )
}

function ToastIcon({ type }: { type: ToastType }) {
  if (type === 'success') {
    return (
      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    )
  }
  if (type === 'error') {
    return (
      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    )
  }
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  )
}

// ─── Activity Log Panel ─────────────────────────────────────────────────

function ActivityLogPanel({
  activity,
  onClear,
  onClose,
}: {
  activity: Toast[]
  onClear: () => void
  onClose: () => void
}) {
  const count = activity.length

  return (
    <div className="fixed bottom-4 left-16 z-[9998] w-80 max-w-[90vw] border border-[var(--border)] bg-[var(--background-elevated)] shadow-xl">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Aktivität
        </div>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            >
              Leeren
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Schliessen"
            className="text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {count === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">
            Noch keine Aktivität
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 px-3 py-2">
                <ActivityDot type={entry.type} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-[var(--text)]">{entry.message}</div>
                  <div className="text-[10px] text-[var(--text-muted)] tabular-nums">
                    {formatRelative(entry.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ActivityDot({ type }: { type: ToastType }) {
  const cls =
    type === 'success'
      ? 'bg-emerald-500'
      : type === 'error'
        ? 'bg-red-500'
        : 'bg-blue-500'
  return <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${cls}`} aria-hidden />
}

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp
  const sec = Math.round(diff / 1000)
  if (sec < 5) return 'gerade eben'
  if (sec < 60) return `vor ${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `vor ${min}min`
  const hr = Math.round(min / 60)
  if (hr < 24) return `vor ${hr}h`
  const days = Math.round(hr / 24)
  if (days < 7) return `vor ${days}d`
  return new Date(timestamp).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })
}
