/**
 * Fail-fast environment-variable validation.
 *
 * Runs once from instrumentation.ts:register() at server boot. The goal is to
 * catch deploys where a critical secret is missing, before silent failures
 * surface as bugs (e.g. confirmation mails that never go out because
 * createConfirmToken throws inside a try/catch).
 *
 * Each rule names *why* the variable matters, so the operator sees in the
 * Coolify deploy log not just "X is missing" but "X needed for Y".
 */

interface EnvRule {
  name: string
  reason: string
  // Optional: minimum length (e.g. for HMAC secrets that must be ≥ 32 chars).
  minLength?: number
  // Optional: skip the rule when this predicate is true (e.g. RESEND_API_KEY
  // is irrelevant when RESEND_FAKE=1 is set for the e2e suite). Receives the
  // env being checked so unit tests can drive the predicate deterministically.
  skipIf?: (env: NodeJS.ProcessEnv) => boolean
}

const RULES: EnvRule[] = [
  {
    name: 'TURSO_DB_URL',
    reason: 'database connection — every read/write fails without it',
  },
  {
    name: 'CONFIRM_TOKEN_SECRET',
    reason: 'signs 24h-expiring newsletter confirmation links',
    minLength: 32,
  },
  {
    name: 'RESEND_API_KEY',
    reason: 'sends every outbound email (newsletter, confirmation, automations)',
    skipIf: (env) => env.RESEND_FAKE === '1',
  },
  {
    name: 'RESEND_WEBHOOK_SECRET',
    reason: 'verifies inbound delivery/bounce/complaint webhooks from Resend',
    skipIf: (env) => env.RESEND_FAKE === '1',
  },
  {
    name: 'ADMIN_PASSWORD',
    reason: 'admin login — without it, no one can sign into the admin UI',
  },
  {
    name: 'LOGIN_HMAC_KEY',
    reason: 'signs admin session cookies',
    minLength: 16,
  },
  {
    name: 'CRON_SECRET',
    reason: 'authenticates the automation-processor cron — without it, scheduled sends stall',
  },
]

export interface EnvCheckProblem {
  name: string
  reason: string
  kind: 'missing' | 'too_short'
  detail?: string
}

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvCheckProblem[] {
  const problems: EnvCheckProblem[] = []
  for (const rule of RULES) {
    if (rule.skipIf?.(env)) continue
    const value = env[rule.name]
    if (!value || value.length === 0) {
      problems.push({ name: rule.name, reason: rule.reason, kind: 'missing' })
      continue
    }
    if (rule.minLength && value.length < rule.minLength) {
      problems.push({
        name: rule.name,
        reason: rule.reason,
        kind: 'too_short',
        detail: `is ${value.length} chars, needs ≥ ${rule.minLength}`,
      })
    }
  }
  return problems
}

export function formatProblems(problems: EnvCheckProblem[]): string {
  const lines = problems.map((p) => {
    const tag = p.kind === 'missing' ? 'MISSING' : 'TOO_SHORT'
    const detail = p.detail ? ` (${p.detail})` : ''
    return `  - ${tag} ${p.name}${detail}\n      → ${p.reason}`
  })
  return [
    '─'.repeat(72),
    '  STARTUP BLOCKED — environment configuration incomplete',
    '─'.repeat(72),
    ...lines,
    '─'.repeat(72),
    '  Set the listed variables in your deployment env (Coolify → Environment',
    '  Variables) and redeploy. See .env.local.example for the documented set.',
    '─'.repeat(72),
  ].join('\n')
}

// Called from instrumentation.ts. On any problem we print a clearly framed
// block to stderr and exit(1) so Coolify marks the deploy as failed instead
// of letting the container come up with broken behaviour.
export function assertEnvOrExit(): void {
  const problems = checkEnv()
  if (problems.length === 0) return
  console.error(formatProblems(problems))
  process.exit(1)
}
