import { describe, it, expect } from 'vitest'
import { parseDbDate } from '@/components/admin/types'

describe('parseDbDate', () => {
  it('treats SQLite datetime() output (no tz) as UTC', () => {
    // SQLite "2026-04-27 18:35:00" must read as 18:35 UTC, not as 18:35 local.
    const d = parseDbDate('2026-04-27 18:35:00')
    expect(d.toISOString()).toBe('2026-04-27T18:35:00.000Z')
  })

  it('respects an explicit Z suffix (already ISO 8601)', () => {
    const d = parseDbDate('2026-04-27T18:35:00Z')
    expect(d.toISOString()).toBe('2026-04-27T18:35:00.000Z')
  })

  it('respects an explicit offset suffix', () => {
    const d = parseDbDate('2026-04-27T20:35:00+02:00')
    expect(d.toISOString()).toBe('2026-04-27T18:35:00.000Z')
  })

  it('handles ISO format without an offset (still treated as UTC)', () => {
    const d = parseDbDate('2026-04-27T18:35:00')
    expect(d.toISOString()).toBe('2026-04-27T18:35:00.000Z')
  })

  it('returns an Invalid Date when given an empty string', () => {
    expect(Number.isNaN(parseDbDate('').getTime())).toBe(true)
  })
})
