import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createConfirmToken, verifyConfirmToken } from '@/lib/confirm-token'

const ORIGINAL_SECRET = process.env.CONFIRM_TOKEN_SECRET

beforeAll(() => {
  process.env.CONFIRM_TOKEN_SECRET = 'test-secret-please-do-not-use-in-prod-please'
})

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CONFIRM_TOKEN_SECRET
  else process.env.CONFIRM_TOKEN_SECRET = ORIGINAL_SECRET
})

describe('createConfirmToken / verifyConfirmToken', () => {
  it('round-trips siteId and lower-cased email', () => {
    const token = createConfirmToken('kokomo', 'Alice@Example.COM')
    const result = verifyConfirmToken(token)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.siteId).toBe('kokomo')
      expect(result.email).toBe('alice@example.com')
    }
  })

  it('produces different tokens for different inputs', () => {
    const a = createConfirmToken('kokomo', 'a@b.com')
    const b = createConfirmToken('kokomo', 'b@b.com')
    expect(a).not.toBe(b)
  })

  it('rejects a token whose signature was tampered with', () => {
    const token = createConfirmToken('kokomo', 'tampered@example.com')

    // Tamper at the BYTE level, not by swapping the last base64url character.
    // Depending on the payload length the trailing characters carry only
    // padding bits, which are discarded on decode — such a "tampered" token
    // looks different but decodes to the exact same bytes and verifies just
    // fine. Because the trailing bits depend on the HMAC, and the HMAC
    // depends on the expiry second, that made this test fail on roughly every
    // other run.
    const raw = Buffer.from(token, 'base64url')
    raw[raw.length - 1] ^= 0x01
    const flipped = raw.toString('base64url')

    expect(Buffer.from(flipped, 'base64url')).not.toEqual(Buffer.from(token, 'base64url'))
    const result = verifyConfirmToken(flipped)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_signature')
  })

  it('rejects malformed input', () => {
    expect(verifyConfirmToken('').ok).toBe(false)
    expect(verifyConfirmToken('not-a-real-token').ok).toBe(false)
    expect(verifyConfirmToken('!!!@@@###').ok).toBe(false)
  })

  it('rejects siteId with delimiter', () => {
    expect(() => createConfirmToken('evil|kokomo', 'a@b.com')).toThrow()
  })

  it('rejects email with delimiter', () => {
    expect(() => createConfirmToken('kokomo', 'a|b@c.com')).toThrow()
  })

  describe('expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    })
    afterEach(() => vi.useRealTimers())

    it('accepts within 24h', () => {
      const token = createConfirmToken('kokomo', 'a@b.com')
      vi.setSystemTime(new Date('2026-01-01T23:59:00Z'))
      expect(verifyConfirmToken(token).ok).toBe(true)
    })

    it('rejects after 24h', () => {
      const token = createConfirmToken('kokomo', 'a@b.com')
      vi.setSystemTime(new Date('2026-01-02T00:01:00Z'))
      const result = verifyConfirmToken(token)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('expired')
    })
  })

  describe('signature isolation per secret', () => {
    it('rejects a token signed with a different secret', () => {
      const token = createConfirmToken('kokomo', 'a@b.com')
      process.env.CONFIRM_TOKEN_SECRET = 'a-different-secret-also-long-enough-to-pass'
      try {
        const result = verifyConfirmToken(token)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.reason).toBe('invalid_signature')
      } finally {
        process.env.CONFIRM_TOKEN_SECRET = 'test-secret-please-do-not-use-in-prod-please'
      }
    })

    it('throws if secret is missing', () => {
      const original = process.env.CONFIRM_TOKEN_SECRET
      delete process.env.CONFIRM_TOKEN_SECRET
      try {
        expect(() => createConfirmToken('kokomo', 'a@b.com')).toThrow(/CONFIRM_TOKEN_SECRET/)
      } finally {
        process.env.CONFIRM_TOKEN_SECRET = original
      }
    })

    it('throws if secret is too short', () => {
      const original = process.env.CONFIRM_TOKEN_SECRET
      process.env.CONFIRM_TOKEN_SECRET = 'too-short'
      try {
        expect(() => createConfirmToken('kokomo', 'a@b.com')).toThrow(/at least 32/)
      } finally {
        process.env.CONFIRM_TOKEN_SECRET = original
      }
    })
  })
})
