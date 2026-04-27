import type { APIRequestContext, BrowserContext, Page, Request } from '@playwright/test'
import { expect } from '@playwright/test'

export const ADMIN_PASSWORD = 'e2e-admin-password-not-secret'

/**
 * Log in via the real /api/admin/login endpoint and return a context with the
 * admin_session cookie set. Use this in `test.beforeEach` for tests that need
 * an authenticated admin.
 */
export async function loginAsAdmin(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/admin/login', {
    data: { password: ADMIN_PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(res.ok(), `login failed: ${res.status()} ${await res.text()}`).toBeTruthy()
}

/**
 * Read all captured emails from the fake Resend transport via the test-only
 * inspection route. Returns the raw payloads exactly as notify.ts sent them.
 */
export interface CapturedSend {
  kind: 'send'
  capturedAt: string
  fakeId: string
  idempotencyKey: string | null
  payload: {
    from?: string
    to?: string | string[]
    subject?: string
    headers?: Record<string, string>
    html?: string
    text?: string
    scheduledAt?: string
    [k: string]: unknown
  }
}
export interface CapturedCancel {
  kind: 'cancel'
  capturedAt: string
  fakeId: string
}
export type Captured = CapturedSend | CapturedCancel

export async function readSentEmails(request: APIRequestContext): Promise<Captured[]> {
  const res = await request.get('/api/test/sent-emails')
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { entries: Captured[] }
  return body.entries
}

export async function clearSentEmails(request: APIRequestContext): Promise<void> {
  const res = await request.delete('/api/test/sent-emails')
  expect(res.ok()).toBeTruthy()
}

export function sendsOnly(entries: Captured[]): CapturedSend[] {
  return entries.filter((e): e is CapturedSend => e.kind === 'send')
}
