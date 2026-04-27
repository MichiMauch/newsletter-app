import { describe, it, expect } from 'vitest'
import { substitutePersonalization } from '@/lib/personalization'

describe('substitutePersonalization', () => {
  it('replaces {{firstName}} with the name', () => {
    expect(substitutePersonalization('Hallo {{firstName}},', { firstName: 'Sibylle' }))
      .toBe('Hallo Sibylle,')
  })

  it('drops {{firstName}} when name is null', () => {
    expect(substitutePersonalization('Hallo {{firstName}},', { firstName: null }))
      .toBe('Hallo ,')
  })

  it('uses the fallback when name is null', () => {
    expect(substitutePersonalization('Hallo {{firstName|du}},', { firstName: null }))
      .toBe('Hallo du,')
  })

  it('uses the fallback when name is empty string', () => {
    expect(substitutePersonalization('Hallo {{firstName|liebe Leserin}},', { firstName: '' }))
      .toBe('Hallo liebe Leserin,')
  })

  it('prefers the name over the fallback', () => {
    expect(substitutePersonalization('Hallo {{firstName|du}},', { firstName: 'Sibylle' }))
      .toBe('Hallo Sibylle,')
  })

  it('replaces multiple occurrences', () => {
    expect(substitutePersonalization('{{firstName}}, {{firstName}}!', { firstName: 'Mia' }))
      .toBe('Mia, Mia!')
  })

  it('leaves unrelated text untouched', () => {
    expect(substitutePersonalization('Plain text without tokens', { firstName: 'X' }))
      .toBe('Plain text without tokens')
  })

  it('handles empty input', () => {
    expect(substitutePersonalization('', { firstName: 'X' })).toBe('')
  })

  it('does not match a partial token', () => {
    expect(substitutePersonalization('{{first_name}}', { firstName: 'X' })).toBe('{{first_name}}')
    expect(substitutePersonalization('{firstName}', { firstName: 'X' })).toBe('{firstName}')
  })

  it('preserves whitespace inside fallback', () => {
    expect(substitutePersonalization('Hallo {{firstName|liebe Leserin}}', { firstName: null }))
      .toBe('Hallo liebe Leserin')
  })
})
