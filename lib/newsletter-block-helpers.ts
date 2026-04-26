import {
  type NewsletterBlock,
  type NewsletterTemplate,
  type PostRef,
  type UserAuthoredBlockType,
} from './newsletter-blocks'

export function createBlock(type: UserAuthoredBlockType): NewsletterBlock {
  const id = crypto.randomUUID()
  switch (type) {
    case 'hero':
      return { id, type: 'hero', slug: '' }
    case 'text':
      return { id, type: 'text', content: '' }
    case 'link-list':
      return { id, type: 'link-list', slugs: [] }
    case 'last_newsletter':
      return { id, type: 'last_newsletter' }
  }
}

export function blocksFromTemplate(template: NewsletterTemplate): NewsletterBlock[] {
  return template.slots.map((slot) => createBlock(slot.type as UserAuthoredBlockType))
}

export function blocksAreValid(blocks: NewsletterBlock[]): boolean {
  if (blocks.length === 0) return false
  return blocks.every((block) => {
    switch (block.type) {
      case 'hero':
        return block.slug !== ''
      case 'text':
        return block.content.trim() !== ''
      case 'link-list':
        return block.slugs.length > 0
      case 'last_newsletter':
        return true
      case 'recap_header':
        return true
    }
  })
}

export function getUsedSlugs(blocks: NewsletterBlock[]): Set<string> {
  const slugs = new Set<string>()
  for (const block of blocks) {
    if (block.type === 'hero') {
      if (block.slug) slugs.add(block.slug)
    }
    if (block.type === 'link-list') {
      block.slugs.forEach((s) => { if (s) slugs.add(s) })
    }
  }
  return slugs
}

export function buildPostsMap<T extends { slug: string }>(blocks: NewsletterBlock[], posts: T[]): Record<string, PostRef> {
  const slugs = new Set<string>()
  for (const block of blocks) {
    if (block.type === 'hero') slugs.add(block.slug)
    if (block.type === 'link-list') block.slugs.forEach((s) => slugs.add(s))
  }
  const map: Record<string, PostRef> = {}
  for (const slug of slugs) {
    const post = posts.find((p) => p.slug === slug)
    if (post) map[slug] = post as unknown as PostRef
  }
  return map
}

// `<input type="datetime-local">` returns "YYYY-MM-DDTHH:mm" without timezone —
// browser interprets it as local time. Construct a Date so the value matches
// what the user sees in their picker (then we serialize to UTC for the API).
export function parseScheduleLocal(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000) // +1h
  d.setMinutes(0, 0, 0)
  // Serialize as YYYY-MM-DDTHH:mm in local TZ for datetime-local input
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
