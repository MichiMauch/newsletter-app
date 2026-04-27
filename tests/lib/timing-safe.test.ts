import { describe, it, expect } from 'vitest'
import { safeEqualStrings } from '@/lib/timing-safe'

describe('safeEqualStrings', () => {
  it('returns true for identical strings', () => {
    expect(safeEqualStrings('secret', 'secret')).toBe(true)
    expect(safeEqualStrings('', '')).toBe(true)
  })

  it('returns false for different strings', () => {
    expect(safeEqualStrings('secret', 'wrong')).toBe(false)
    expect(safeEqualStrings('a', 'b')).toBe(false)
  })

  it('returns false for strings of different length', () => {
    expect(safeEqualStrings('short', 'a-much-longer-value')).toBe(false)
  })

  it('handles unicode correctly', () => {
    expect(safeEqualStrings('über', 'über')).toBe(true)
    expect(safeEqualStrings('über', 'uber')).toBe(false)
  })

  it('produces fixed-length digests internally (never throws on length mismatch)', () => {
    // Verifies the API contract: both inputs are HMAC'd, so the underlying
    // timingSafeEqual never sees mismatched buffer lengths.
    expect(() => safeEqualStrings('a', 'b'.repeat(10_000))).not.toThrow()
  })
})
