import { describe, it, expect } from 'vitest'
import {
  expandInlineLastNewsletter,
  wrapLastNewsletterStandalone,
  DEFAULT_RECAP_LABEL,
  type NewsletterBlock,
} from '@/lib/newsletter-blocks'

const heroA: NewsletterBlock = { id: 'h1', type: 'hero', slug: 'a' }
const text: NewsletterBlock = { id: 't1', type: 'text', content: 'Hi' }
const lastNewsletter: NewsletterBlock = { id: 'ln1', type: 'last_newsletter' }
const lastNewsletterCustomLabel: NewsletterBlock = {
  id: 'ln2',
  type: 'last_newsletter',
  recapLabel: 'Eigener Recap',
}

describe('expandInlineLastNewsletter', () => {
  it('passes through when no placeholder is present', () => {
    expect(expandInlineLastNewsletter([heroA, text], null)).toEqual([heroA, text])
  })

  it('drops the placeholder when no last send exists', () => {
    expect(expandInlineLastNewsletter([heroA, lastNewsletter, text], null)).toEqual([heroA, text])
  })

  it('drops the placeholder when last send has zero blocks', () => {
    expect(expandInlineLastNewsletter([heroA, lastNewsletter], [])).toEqual([heroA])
  })

  it('inserts a recap header before expanded blocks', () => {
    const expanded: NewsletterBlock[] = [{ id: 'old-h', type: 'hero', slug: 'old' }]
    const result = expandInlineLastNewsletter([heroA, lastNewsletter], expanded)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(heroA)
    expect(result[1]).toEqual({
      id: 'ln1-recap-header',
      type: 'recap_header',
      label: DEFAULT_RECAP_LABEL,
    })
    expect(result[2]).toEqual(expanded[0])
  })

  it('uses the per-placeholder recapLabel override', () => {
    const expanded: NewsletterBlock[] = [{ id: 'old-h', type: 'hero', slug: 'old' }]
    const result = expandInlineLastNewsletter([lastNewsletterCustomLabel], expanded)
    expect(result[0]).toMatchObject({ type: 'recap_header', label: 'Eigener Recap' })
  })

  it('expands multiple placeholders independently', () => {
    const expanded: NewsletterBlock[] = [{ id: 'old', type: 'text', content: 'old' }]
    const result = expandInlineLastNewsletter([lastNewsletter, lastNewsletterCustomLabel], expanded)
    expect(result.filter((b) => b.type === 'recap_header')).toHaveLength(2)
    expect(result.filter((b) => b.type === 'text')).toHaveLength(2)
  })
})

describe('wrapLastNewsletterStandalone', () => {
  it('prepends a recap header with the default label', () => {
    const blocks: NewsletterBlock[] = [{ id: 'a', type: 'text', content: 'old' }]
    const result = wrapLastNewsletterStandalone(blocks, 'owner-x')
    expect(result[0]).toEqual({
      id: 'owner-x-recap-header',
      type: 'recap_header',
      label: DEFAULT_RECAP_LABEL,
    })
    expect(result.slice(1)).toEqual(blocks)
  })

  it('honours a custom label', () => {
    const blocks: NewsletterBlock[] = [{ id: 'a', type: 'text', content: 'old' }]
    const result = wrapLastNewsletterStandalone(blocks, 'owner', 'Mein Label')
    expect((result[0] as Extract<NewsletterBlock, { type: 'recap_header' }>).label).toBe('Mein Label')
  })
})
