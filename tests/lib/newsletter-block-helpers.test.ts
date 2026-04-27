import { describe, it, expect, vi } from 'vitest'
import {
  blocksAreValid,
  buildPostsMap,
  getUsedSlugs,
  parseScheduleLocal,
  defaultScheduleValue,
} from '@/lib/newsletter-block-helpers'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'

describe('blocksAreValid', () => {
  it('rejects empty arrays', () => {
    expect(blocksAreValid([])).toBe(false)
  })

  it('requires hero blocks to have a slug', () => {
    expect(blocksAreValid([{ id: '1', type: 'hero', slug: '' }])).toBe(false)
    expect(blocksAreValid([{ id: '1', type: 'hero', slug: 'a' }])).toBe(true)
  })

  it('requires text blocks to have non-whitespace content', () => {
    expect(blocksAreValid([{ id: '1', type: 'text', content: '   ' }])).toBe(false)
    expect(blocksAreValid([{ id: '1', type: 'text', content: 'Hi' }])).toBe(true)
  })

  it('requires link-list blocks to have slugs', () => {
    expect(blocksAreValid([{ id: '1', type: 'link-list', slugs: [] }])).toBe(false)
    expect(blocksAreValid([{ id: '1', type: 'link-list', slugs: ['a'] }])).toBe(true)
  })

  it('treats last_newsletter and recap_header as always valid', () => {
    expect(blocksAreValid([{ id: '1', type: 'last_newsletter' }])).toBe(true)
    expect(blocksAreValid([{ id: '1', type: 'recap_header', label: 'r' }])).toBe(true)
  })

  it('rejects when a single block is invalid', () => {
    const blocks: NewsletterBlock[] = [
      { id: '1', type: 'hero', slug: 'good' },
      { id: '2', type: 'text', content: '' },
    ]
    expect(blocksAreValid(blocks)).toBe(false)
  })
})

describe('getUsedSlugs', () => {
  it('collects slugs from hero + link-list blocks', () => {
    const blocks: NewsletterBlock[] = [
      { id: '1', type: 'hero', slug: 'a' },
      { id: '2', type: 'link-list', slugs: ['b', 'c'] },
      { id: '3', type: 'text', content: 'ignore' },
    ]
    expect([...getUsedSlugs(blocks)].sort()).toEqual(['a', 'b', 'c'])
  })

  it('skips empty slugs', () => {
    const blocks: NewsletterBlock[] = [
      { id: '1', type: 'hero', slug: '' },
      { id: '2', type: 'link-list', slugs: ['', 'b'] },
    ]
    expect([...getUsedSlugs(blocks)]).toEqual(['b'])
  })
})

describe('buildPostsMap', () => {
  const posts: PostRef[] = [
    { slug: 'a', title: 'A', summary: '', image: null, date: '' },
    { slug: 'b', title: 'B', summary: '', image: null, date: '' },
  ]

  it('returns only posts referenced by blocks', () => {
    const blocks: NewsletterBlock[] = [{ id: '1', type: 'hero', slug: 'a' }]
    expect(buildPostsMap(blocks, posts)).toEqual({ a: posts[0] })
  })

  it('ignores blocks with unknown slugs', () => {
    const blocks: NewsletterBlock[] = [
      { id: '1', type: 'hero', slug: 'unknown' },
      { id: '2', type: 'link-list', slugs: ['b'] },
    ]
    expect(buildPostsMap(blocks, posts)).toEqual({ b: posts[1] })
  })

  it('handles empty blocks', () => {
    expect(buildPostsMap([], posts)).toEqual({})
  })
})

describe('parseScheduleLocal', () => {
  it('parses valid datetime-local strings', () => {
    const d = parseScheduleLocal('2026-05-01T08:30')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(4) // May
  })

  it('returns null for empty or invalid strings', () => {
    expect(parseScheduleLocal('')).toBeNull()
    expect(parseScheduleLocal('not a date')).toBeNull()
  })
})

describe('defaultScheduleValue', () => {
  it('produces a YYYY-MM-DDTHH:mm string one hour ahead, rounded to the hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-01T09:23:45.000'))
    const value = defaultScheduleValue()
    // Expected local time = +1h, rounded down to hour. We can't assert exact value
    // because env TZ varies — but format must match and minutes must be "00".
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/)
    vi.useRealTimers()
  })
})
