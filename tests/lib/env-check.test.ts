import { describe, it, expect } from 'vitest'
import { checkEnv, formatProblems } from '@/lib/env-check'

const FULL_ENV = {
  TURSO_DB_URL: 'libsql://example.turso.io',
  CONFIRM_TOKEN_SECRET: 'a'.repeat(40),
  RESEND_API_KEY: 're_xxx',
  RESEND_WEBHOOK_SECRET: 'whsec_xxx',
  ADMIN_PASSWORD: 'a-secure-password',
  LOGIN_HMAC_KEY: 'hmac-key-at-least-sixteen-chars',
  CRON_SECRET: 'cron-secret',
} as unknown as NodeJS.ProcessEnv

describe('checkEnv', () => {
  it('returns no problems when every required var is set', () => {
    expect(checkEnv(FULL_ENV)).toEqual([])
  })

  it('flags a missing required var', () => {
    const env = { ...FULL_ENV, TURSO_DB_URL: undefined } as unknown as NodeJS.ProcessEnv
    const problems = checkEnv(env)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ name: 'TURSO_DB_URL', kind: 'missing' })
  })

  it('flags a present-but-empty var as missing', () => {
    const env = { ...FULL_ENV, ADMIN_PASSWORD: '' } as unknown as NodeJS.ProcessEnv
    expect(checkEnv(env)).toContainEqual(
      expect.objectContaining({ name: 'ADMIN_PASSWORD', kind: 'missing' }),
    )
  })

  it('flags a CONFIRM_TOKEN_SECRET that is shorter than 32 chars', () => {
    const env = { ...FULL_ENV, CONFIRM_TOKEN_SECRET: 'too-short' } as unknown as NodeJS.ProcessEnv
    const problems = checkEnv(env)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ name: 'CONFIRM_TOKEN_SECRET', kind: 'too_short' })
    expect(problems[0].detail).toMatch(/9 chars/)
  })

  it('flags multiple problems in one pass', () => {
    const env = {
      ...FULL_ENV,
      TURSO_DB_URL: undefined,
      LOGIN_HMAC_KEY: 'short',
    } as unknown as NodeJS.ProcessEnv
    const problems = checkEnv(env)
    expect(problems.map((p) => p.name).sort()).toEqual(['LOGIN_HMAC_KEY', 'TURSO_DB_URL'])
  })

  it('skips Resend secrets when RESEND_FAKE=1 (e2e environment)', () => {
    const env = {
      ...FULL_ENV,
      RESEND_API_KEY: undefined,
      RESEND_WEBHOOK_SECRET: undefined,
      RESEND_FAKE: '1',
    } as unknown as NodeJS.ProcessEnv
    expect(checkEnv(env)).toEqual([])
  })

  it('does NOT skip Resend secrets when RESEND_FAKE is unset', () => {
    const env = {
      ...FULL_ENV,
      RESEND_API_KEY: undefined,
      RESEND_WEBHOOK_SECRET: undefined,
    } as unknown as NodeJS.ProcessEnv
    const names = checkEnv(env).map((p) => p.name).sort()
    expect(names).toEqual(['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'])
  })
})

describe('formatProblems', () => {
  it('renders a multi-line, framed message with reason for each problem', () => {
    const out = formatProblems([
      { name: 'CONFIRM_TOKEN_SECRET', reason: 'signs links', kind: 'missing' },
    ])
    expect(out).toMatch(/STARTUP BLOCKED/)
    expect(out).toMatch(/MISSING CONFIRM_TOKEN_SECRET/)
    expect(out).toMatch(/signs links/)
    expect(out).toMatch(/Coolify/)
  })

  it('includes the detail field for too_short problems', () => {
    const out = formatProblems([
      { name: 'CONFIRM_TOKEN_SECRET', reason: 'r', kind: 'too_short', detail: 'is 5 chars, needs ≥ 32' },
    ])
    expect(out).toMatch(/TOO_SHORT/)
    expect(out).toMatch(/is 5 chars/)
  })
})
