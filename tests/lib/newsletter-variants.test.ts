import { describe, it, expect } from 'vitest'
import { parseVariantsInput, assignVariants } from '@/lib/newsletter-variants'

describe('parseVariantsInput', () => {
  it('rejects non-arrays and arrays with the wrong size', () => {
    expect(parseVariantsInput(null)).toBeNull()
    expect(parseVariantsInput('A,B')).toBeNull()
    expect(parseVariantsInput([])).toBeNull()
    expect(parseVariantsInput([{ label: 'A', subject: 'x' }])).toBeNull()
    expect(
      parseVariantsInput(Array.from({ length: 6 }, (_, i) => ({ label: String(i), subject: 's' }))),
    ).toBeNull()
  })

  it('accepts a clean two-variant array', () => {
    const result = parseVariantsInput([
      { label: 'A', subject: 'Subject A' },
      { label: 'B', subject: 'Subject B' },
    ])
    expect(result).toEqual([
      { label: 'A', subject: 'Subject A' },
      { label: 'B', subject: 'Subject B' },
    ])
  })

  it('rejects duplicate labels', () => {
    expect(
      parseVariantsInput([
        { label: 'A', subject: 'x' },
        { label: 'A', subject: 'y' },
      ]),
    ).toBeNull()
  })

  it('rejects unsafe label characters', () => {
    expect(
      parseVariantsInput([
        { label: 'A; DROP TABLE', subject: 'x' },
        { label: 'B', subject: 'y' },
      ]),
    ).toBeNull()
  })

  it('rejects empty or oversized subjects', () => {
    expect(
      parseVariantsInput([
        { label: 'A', subject: '' },
        { label: 'B', subject: 'y' },
      ]),
    ).toBeNull()
    expect(
      parseVariantsInput([
        { label: 'A', subject: 'x'.repeat(201) },
        { label: 'B', subject: 'y' },
      ]),
    ).toBeNull()
  })

  it('trims subject whitespace', () => {
    expect(
      parseVariantsInput([
        { label: 'A', subject: '  hello  ' },
        { label: 'B', subject: 'world' },
      ]),
    ).toEqual([
      { label: 'A', subject: 'hello' },
      { label: 'B', subject: 'world' },
    ])
  })
})

describe('assignVariants', () => {
  const variants = [
    { label: 'A', subject: 'sa' },
    { label: 'B', subject: 'sb' },
  ]

  it('splits recipients evenly between two variants', () => {
    const recipients = [
      { email: 'a@x' }, { email: 'b@x' }, { email: 'c@x' }, { email: 'd@x' },
    ]
    const out = assignVariants(recipients, variants)
    const counts = out.reduce<Record<string, number>>((acc, r) => {
      acc[r.variant.label] = (acc[r.variant.label] ?? 0) + 1
      return acc
    }, {})
    expect(counts).toEqual({ A: 2, B: 2 })
  })

  it('produces a deterministic split for the same audience', () => {
    const recipients = ['a@x', 'b@x', 'c@x', 'd@x', 'e@x'].map((email) => ({ email }))
    const first = assignVariants(recipients, variants).map((r) => `${r.email}:${r.variant.label}`)
    // Re-run with shuffled input — sorted+round-robin keeps the assignment stable.
    const shuffled = [...recipients].reverse()
    const second = assignVariants(shuffled, variants).map((r) => `${r.email}:${r.variant.label}`)
    expect(second.sort()).toEqual(first.sort())
  })

  it('keeps the imbalance to <= 1 with odd audience sizes', () => {
    const recipients = ['a@x', 'b@x', 'c@x'].map((email) => ({ email }))
    const out = assignVariants(recipients, variants)
    const counts = out.reduce<Record<string, number>>((acc, r) => {
      acc[r.variant.label] = (acc[r.variant.label] ?? 0) + 1
      return acc
    }, {})
    expect(Math.abs((counts.A ?? 0) - (counts.B ?? 0))).toBeLessThanOrEqual(1)
  })

  it('extends to N variants by round-robin', () => {
    const variantsAbc = [
      { label: 'A', subject: 'a' }, { label: 'B', subject: 'b' }, { label: 'C', subject: 'c' },
    ]
    const recipients = ['a@x', 'b@x', 'c@x', 'd@x', 'e@x', 'f@x'].map((email) => ({ email }))
    const out = assignVariants(recipients, variantsAbc)
    const counts = out.reduce<Record<string, number>>((acc, r) => {
      acc[r.variant.label] = (acc[r.variant.label] ?? 0) + 1
      return acc
    }, {})
    expect(counts).toEqual({ A: 2, B: 2, C: 2 })
  })
})
