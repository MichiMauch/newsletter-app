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

export type NewsletterBlock = HeroBlock | TextBlock | LinkListBlock

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
