/**
 * Shared types for the newsletter block editor
 */

export interface PostRef {
  slug: string
  title: string
  summary: string
  image: string | null
  date: string
}

export interface HeroBlock {
  id: string
  type: 'hero'
  slug: string
}

export interface TextBlock {
  id: string
  type: 'text'
  content: string
}

export interface LinkListBlock {
  id: string
  type: 'link-list'
  slugs: string[]
}

export interface LastNewsletterBlock {
  id: string
  type: 'last_newsletter'
  recapLabel?: string
}

export interface RecapHeaderBlock {
  id: string
  type: 'recap_header'
  label: string
}

export type NewsletterBlock =
  | HeroBlock
  | TextBlock
  | LinkListBlock
  | LastNewsletterBlock
  | RecapHeaderBlock

/**
 * Block types the admin can add via the editor.
 * Excludes system-only types (e.g. recap_header) which are injected
 * at send-time by the graph-processor when expanding `last_newsletter`.
 */
export type UserAuthoredBlockType = Exclude<NewsletterBlock['type'], 'recap_header'>

export const DEFAULT_RECAP_LABEL = 'Das war unser letzter Newsletter'

/**
 * Replace inline `last_newsletter` placeholder blocks with the actual
 * blocks from the last sent newsletter, prefixed with a `recap_header`
 * for visual separation. If no last send is available, the placeholder
 * is silently dropped.
 */
export function expandInlineLastNewsletter(
  rawBlocks: NewsletterBlock[],
  lastSendBlocks: NewsletterBlock[] | null,
): NewsletterBlock[] {
  const result: NewsletterBlock[] = []
  for (const b of rawBlocks) {
    if (b.type === 'last_newsletter') {
      if (lastSendBlocks && lastSendBlocks.length > 0) {
        result.push({
          id: `${b.id}-recap-header`,
          type: 'recap_header',
          label: b.recapLabel ?? DEFAULT_RECAP_LABEL,
        })
        result.push(...lastSendBlocks)
      }
    } else {
      result.push(b)
    }
  }
  return result
}

/**
 * Wrap a standalone re-send of the last newsletter with a `recap_header`
 * so the recipient knows they are seeing previously published content.
 */
export function wrapLastNewsletterStandalone(
  lastSendBlocks: NewsletterBlock[],
  ownerId: string,
  label: string = DEFAULT_RECAP_LABEL,
): NewsletterBlock[] {
  return [
    { id: `${ownerId}-recap-header`, type: 'recap_header', label },
    ...lastSendBlocks,
  ]
}

export interface NewsletterTemplate {
  id: string
  name: string
  slots: { type: NewsletterBlock['type'] }[]
  builtIn?: boolean
}

export const BUILT_IN_TEMPLATES: NewsletterTemplate[] = [
  {
    id: 'hero-text',
    name: 'Hero + Freitext',
    builtIn: true,
    slots: [{ type: 'hero' }, { type: 'text' }],
  },
  {
    id: 'hero-links',
    name: 'Hero + Freitext + Links',
    builtIn: true,
    slots: [{ type: 'hero' }, { type: 'text' }, { type: 'link-list' }],
  },
]
