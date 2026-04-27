import { describe, it, expect } from 'vitest'
import { isValidEmail, validateContentItem } from '@/lib/validators'

describe('isValidEmail', () => {
  it('accepts standard addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
    expect(isValidEmail('first.last+tag@sub.example.co')).toBe(true)
  })

  it('rejects non-strings', () => {
    expect(isValidEmail(undefined)).toBe(false)
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(42)).toBe(false)
    expect(isValidEmail({})).toBe(false)
  })

  it('rejects malformed strings', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('   ')).toBe(false)
    expect(isValidEmail('plainstring')).toBe(false)
    expect(isValidEmail('two@@signs.com')).toBe(false)
    expect(isValidEmail('no-tld@host')).toBe(false)
    expect(isValidEmail('spaces in@host.com')).toBe(false)
  })

  it('enforces RFC 5321 length cap of 254', () => {
    const local = 'a'.repeat(64)
    const domain = 'b'.repeat(180) + '.com'
    const tooLong = `${local}@${'c'.repeat(255)}.com`
    expect(isValidEmail(`${local}@${domain}`)).toBe(true)
    expect(isValidEmail(tooLong)).toBe(false)
  })

  it('trims before checking length but leaves stricter checks intact', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true)
  })
})

describe('validateContentItem', () => {
  it('accepts a minimal valid item', () => {
    const result = validateContentItem({ slug: 'hello-world', title: 'Hello' })
    expect(result).toEqual({ slug: 'hello-world', title: 'Hello' })
  })

  it('strips unknown fields (mass-assignment defence)', () => {
    const result = validateContentItem({
      slug: 'a',
      title: 'A',
      isAdmin: true,
      injected: { drop: 'tables' },
    } as unknown)
    expect(result).toEqual({ slug: 'a', title: 'A' })
  })

  it('rejects bad slugs', () => {
    expect(validateContentItem({ slug: 'Has-Caps', title: 'X' })).toBeNull()
    expect(validateContentItem({ slug: '-leading', title: 'X' })).toBeNull()
    expect(validateContentItem({ slug: '', title: 'X' })).toBeNull()
  })

  it('rejects oversize fields', () => {
    expect(validateContentItem({ slug: 'a', title: 'a'.repeat(301) })).toBeNull()
    expect(validateContentItem({ slug: 'a', title: 'A', summary: 'x'.repeat(2001) })).toBeNull()
  })

  it('rejects non-https/http image urls', () => {
    expect(validateContentItem({ slug: 'a', title: 'A', image: 'javascript:alert(1)' })).toBeNull()
    expect(validateContentItem({ slug: 'a', title: 'A', image: 'ftp://x.com/a.png' })).toBeNull()
    expect(validateContentItem({ slug: 'a', title: 'A', image: 'https://x.com/a.png' })).not.toBeNull()
  })

  it('caps tags array length', () => {
    const tags = Array.from({ length: 33 }, (_, i) => `tag-${i}`)
    expect(validateContentItem({ slug: 'a', title: 'A', tags })).toBeNull()
  })

  it('rejects non-string tags', () => {
    expect(validateContentItem({ slug: 'a', title: 'A', tags: ['ok', 42] })).toBeNull()
  })
})
