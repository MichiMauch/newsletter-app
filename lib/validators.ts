/**
 * Lightweight runtime validators for request payloads.
 *
 * These are local — we'd reach for zod if the schemas grew, but the current
 * surface is small enough that hand-rolled checks are clearer and avoid an
 * extra runtime dependency.
 */

// ─── Email ──────────────────────────────────────────────────────────────

// RFC 5321 cap: 254 chars. Local + @ + domain with at least one dot.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const v = value.trim()
  return v.length > 0 && v.length <= 254 && EMAIL_RE.test(v)
}

// ─── Content sync items ─────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/
const TITLE_MAX = 300
const SUMMARY_MAX = 2000
const URL_MAX = 1000
const TAG_MAX = 64
const TAGS_MAX_COUNT = 32

export interface ValidatedContentItem {
  slug: string
  title: string
  summary?: string
  image?: string
  date?: string
  tags?: string[]
  published?: boolean
}

function isHttpsUrl(value: string): boolean {
  if (value.length === 0 || value.length > URL_MAX) return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function isIsoLikeDate(value: string): boolean {
  if (value.length > 64) return false
  // Cheap check: parseable, not nonsense
  const d = new Date(value)
  return !Number.isNaN(d.getTime())
}

/**
 * Validate a single content-sync item. Returns a clean copy with only the
 * known fields (no mass-assignment), or `null` if any field is invalid.
 */
export function validateContentItem(raw: unknown): ValidatedContentItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  if (typeof r.slug !== 'string' || !SLUG_RE.test(r.slug)) return null
  if (typeof r.title !== 'string' || r.title.length === 0 || r.title.length > TITLE_MAX) return null

  const out: ValidatedContentItem = {
    slug: r.slug,
    title: r.title,
  }

  if (r.summary !== undefined && r.summary !== null) {
    if (typeof r.summary !== 'string' || r.summary.length > SUMMARY_MAX) return null
    out.summary = r.summary
  }

  if (r.image !== undefined && r.image !== null) {
    if (typeof r.image !== 'string' || !isHttpsUrl(r.image)) return null
    out.image = r.image
  }

  if (r.date !== undefined && r.date !== null) {
    if (typeof r.date !== 'string' || !isIsoLikeDate(r.date)) return null
    out.date = r.date
  }

  if (r.tags !== undefined && r.tags !== null) {
    if (!Array.isArray(r.tags) || r.tags.length > TAGS_MAX_COUNT) return null
    const tags: string[] = []
    for (const t of r.tags) {
      if (typeof t !== 'string' || t.length === 0 || t.length > TAG_MAX) return null
      tags.push(t)
    }
    out.tags = tags
  }

  if (r.published !== undefined && r.published !== null) {
    if (typeof r.published !== 'boolean') return null
    out.published = r.published
  }

  return out
}
