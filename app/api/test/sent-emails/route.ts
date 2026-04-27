/**
 * Test-only endpoint: read or clear the captured emails written by the
 * fake Resend transport. Refuses to serve unless E2E=1 is set in the
 * server's environment — `proxy.ts` enforces the same guard, but we
 * double-check here as defence-in-depth in case middleware is bypassed.
 *
 * GET    /api/test/sent-emails   → list captured entries as JSON
 * DELETE /api/test/sent-emails   → wipe the capture file
 */

import { readCapturedEmails, clearCapturedEmails } from '@/lib/resend-client'

function gate(): Response | null {
  if (process.env.E2E !== '1') {
    return new Response('Not found', { status: 404 })
  }
  return null
}

export async function GET() {
  const blocked = gate()
  if (blocked) return blocked
  const entries = await readCapturedEmails()
  return Response.json({ entries })
}

export async function DELETE() {
  const blocked = gate()
  if (blocked) return blocked
  await clearCapturedEmails()
  return Response.json({ ok: true })
}
