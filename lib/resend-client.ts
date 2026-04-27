/**
 * Resend client abstraction with a fake transport for E2E tests.
 *
 * In production: returns the real `Resend` instance.
 * When `RESEND_FAKE=1`: returns a stub that captures every send/cancel into
 *   `.test-artifacts/sent-emails.jsonl` so Playwright tests can assert on
 *   what was sent (subject, recipient, idempotency key, …) without hitting
 *   Resend.
 *
 * The fake intentionally only implements the methods we actually call
 * (`emails.send` + `emails.cancel`) — anything else throws so a missing
 * implementation surfaces immediately rather than silently no-op'ing.
 */

import { Resend } from 'resend'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface CapturedEmail {
  capturedAt: string
  payload: Record<string, unknown>
  idempotencyKey: string | null
  fakeId: string
  kind: 'send'
}

export interface CapturedCancel {
  capturedAt: string
  fakeId: string
  kind: 'cancel'
}

const ARTIFACTS_DIR = path.resolve(process.cwd(), '.test-artifacts')
const CAPTURE_FILE = path.join(ARTIFACTS_DIR, 'sent-emails.jsonl')

async function appendCapture(entry: CapturedEmail | CapturedCancel) {
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true })
  await fs.appendFile(CAPTURE_FILE, JSON.stringify(entry) + '\n', 'utf8')
}

export async function readCapturedEmails(): Promise<Array<CapturedEmail | CapturedCancel>> {
  try {
    const raw = await fs.readFile(CAPTURE_FILE, 'utf8')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedEmail | CapturedCancel)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

export async function clearCapturedEmails(): Promise<void> {
  try {
    await fs.unlink(CAPTURE_FILE)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

type ResendLike = Pick<Resend, 'emails'>

let _fakeIdCounter = 0
function nextFakeId(): string {
  _fakeIdCounter += 1
  return `fake-${Date.now()}-${_fakeIdCounter}`
}

function buildFakeClient(): ResendLike {
  return {
    emails: {
      async send(payload: Record<string, unknown>, options?: { idempotencyKey?: string }) {
        const fakeId = nextFakeId()
        await appendCapture({
          kind: 'send',
          capturedAt: new Date().toISOString(),
          payload,
          idempotencyKey: options?.idempotencyKey ?? null,
          fakeId,
        })
        return { data: { id: fakeId }, error: null }
      },
      async cancel(id: string) {
        await appendCapture({
          kind: 'cancel',
          capturedAt: new Date().toISOString(),
          fakeId: id,
        })
        return { data: { object: 'email', id }, error: null }
      },
      // Stubs for unused methods — surface clearly if a new code path starts
      // using them so we update the fake instead of getting silent no-ops.
      get(): never { throw new Error('FakeResend.emails.get is not implemented') },
      update(): never { throw new Error('FakeResend.emails.update is not implemented') },
    } as unknown as Resend['emails'],
  }
}

let _resend: Resend | null = null
let _fakeResend: ResendLike | null = null

export function isResendFake(): boolean {
  return process.env.RESEND_FAKE === '1'
}

export function getResendClient(): ResendLike {
  if (isResendFake()) {
    if (!_fakeResend) _fakeResend = buildFakeClient()
    return _fakeResend
  }
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}
