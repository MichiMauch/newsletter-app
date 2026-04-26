export interface Subscriber {
  id: number
  email: string
  status: 'pending' | 'confirmed' | 'unsubscribed'
  createdAt: string
  confirmedAt: string | null
  unsubscribedAt: string | null
  engagement_score?: number | null
  engagement_tier?: 'active' | 'moderate' | 'dormant' | 'cold' | null
  tags?: string[]
}

export const tierBadge: Record<string, { label: string; cls: string }> = {
  active: { label: 'Aktiv', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' },
  moderate: { label: 'Mässig', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
  dormant: { label: 'Schlafend', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
  cold: { label: 'Kalt', cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
}

export interface NewsletterSend {
  id: number
  post_slug: string
  post_title: string
  subject: string
  sent_at: string
  scheduled_for?: string | null
  status?: string
  recipient_count: number
  delivered_count?: number
  clicked_count?: number
  bounced_count?: number
  complained_count?: number
}

export interface NewsletterRecipientRow {
  id: number
  email: string
  resend_email_id: string | null
  status: 'sent' | 'delivered' | 'clicked' | 'bounced' | 'complained'
  delivered_at: string | null
  clicked_at: string | null
  click_count: number
  bounced_at: string | null
  bounce_type: string | null
  complained_at: string | null
}

export interface LinkClickRow {
  url: string
  click_count: number
  unique_clickers: number
}

export interface OverallStatsData {
  total_sends: number
  total_recipients: number
  avg_click_rate: number
  avg_bounce_rate: number
  total_complaints: number
}

export interface Post {
  slug: string
  title: string
  summary: string
  image: string | null
  date: string
}

export interface SendTrend {
  id: number
  subject: string
  sent_at: string
  recipient_count: number
  click_rate: number
  bounce_rate: number
}

export interface SubscriberGrowth {
  month: string
  total: number
  new_count: number
}

export type Tab = 'dashboard' | 'compose' | 'subscribers' | 'history' | 'settings' | 'automations'

export interface NewsletterDraft {
  id: string
  subject: string
  blocks: import('@/lib/newsletter-blocks').NewsletterBlock[]
  templateId: string | null
  savedAt: string
}

export type ToastState = { type: 'success' | 'error' | 'info'; message: string } | null

export type ConfirmActionState = { title: string; message: string; onConfirm: () => void } | null

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-CH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-CH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export const statusBadge: Record<string, { label: string; cls: string }> = {
  confirmed: {
    label: 'Bestätigt',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  },
  pending: {
    label: 'Ausstehend',
    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  },
  unsubscribed: {
    label: 'Abgemeldet',
    cls: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  },
}

export const inputCls =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text)] outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30'
