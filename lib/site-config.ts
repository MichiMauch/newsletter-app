import { eq } from 'drizzle-orm'
import { getDb } from './db'
import { sites } from './schema'

// Single tenant for now. When multi-site auth lands, derive this from the
// session/request — every callsite already uses the constant via this module.
export const DEFAULT_SITE_ID = 'kokomo'

export interface SiteConfig {
  id: string
  name: string
  site_url: string
  logo_url: string | null
  primary_color: string
  accent_color: string
  gradient_end: string
  font_family: string
  from_email: string
  from_name: string
  footer_text: string | null
  social_links: Record<string, string>
  allowed_origin: string
  turnstile_site_key: string | null
  locale: string
}

const siteConfigCache = new Map<string, { config: SiteConfig; ts: number }>()
const CACHE_TTL = 60_000

function rowToSiteConfig(row: typeof sites.$inferSelect): SiteConfig {
  return {
    id: row.id,
    name: row.name,
    site_url: row.siteUrl,
    logo_url: row.logoUrl,
    primary_color: row.primaryColor,
    accent_color: row.accentColor,
    gradient_end: row.gradientEnd,
    font_family: row.fontFamily,
    from_email: row.fromEmail,
    from_name: row.fromName,
    footer_text: row.footerText,
    social_links: JSON.parse(row.socialLinksJson || '{}'),
    allowed_origin: row.allowedOrigin,
    turnstile_site_key: row.turnstileSiteKey,
    locale: row.locale,
  }
}

export async function getSiteConfig(siteId: string): Promise<SiteConfig> {
  const cached = siteConfigCache.get(siteId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.config

  const db = getDb()
  const rows = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1)

  if (!rows[0]) {
    throw new Error(`Site not found: ${siteId}`)
  }

  const config = rowToSiteConfig(rows[0])
  siteConfigCache.set(siteId, { config, ts: Date.now() })
  return config
}

export async function getAllSites(): Promise<SiteConfig[]> {
  const db = getDb()
  const rows = await db.select().from(sites).orderBy(sites.name)
  return rows.map(rowToSiteConfig)
}
