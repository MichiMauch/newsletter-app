import { test, expect } from '@playwright/test'
import { clearSentEmails, loginAsAdmin, readSentEmails, sendsOnly } from './helpers'

test.describe('admin: A/B subject test', () => {
  test.beforeEach(async ({ request }) => {
    await loginAsAdmin(request)
    await clearSentEmails(request)
  })

  test('A/B combined with scheduled send: each recipient gets the variant subject and scheduledAt', async ({ request }) => {
    // 5 minutes from now — within the 1h push horizon, so the scheduler pushes
    // immediately to Resend (rather than waiting for the next cron tick).
    const scheduledFor = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const res = await request.post('/api/admin/newsletter', {
      data: {
        action: 'send',
        subject: 'Geplante Variante A',
        blocks: [{ id: 'b1', type: 'text', content: 'Hi scheduled A/B' }],
        scheduledFor,
        variants: [
          { label: 'A', subject: 'Geplante Variante A' },
          { label: 'B', subject: 'Geplante Variante B' },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.ok(), `expected ok, got ${res.status()} ${await res.text()}`).toBeTruthy()
    await res.body()

    const sends = sendsOnly(await readSentEmails(request))
    expect(sends.length).toBe(5)

    // Every captured send must carry the requested scheduledAt — that is the
    // signal that Resend will hold the mail until then.
    for (const s of sends) {
      expect(s.payload.scheduledAt).toBe(scheduledFor)
    }

    const subjects = sends.map((s) => s.payload.subject)
    const aCount = subjects.filter((s) => s === 'Geplante Variante A').length
    const bCount = subjects.filter((s) => s === 'Geplante Variante B').length
    expect(aCount + bCount).toBe(5)
    // Five subscribers split round-robin → 3/2 split (or 2/3), never all on one side.
    expect(Math.abs(aCount - bCount)).toBeLessThanOrEqual(1)
    expect(aCount).toBeGreaterThanOrEqual(2)
    expect(bCount).toBeGreaterThanOrEqual(2)

    const recipients = sends.map((s) => s.payload.to)
    expect(new Set(recipients).size).toBe(5)
  })

  test('rejects A/B combined with send-time optimization', async ({ request }) => {
    const res = await request.post('/api/admin/newsletter', {
      data: {
        action: 'send',
        subject: 'A',
        blocks: [{ id: 'b1', type: 'text', content: 'Hi' }],
        useSto: true,
        variants: [
          { label: 'A', subject: 'Variante A' },
          { label: 'B', subject: 'Variante B' },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(400)
  })

  test('full send: bucket the seeded audience into A/B and verify subjects', async ({ request }) => {
    // Stream the send. The route returns chunked text — we just need the body to drain.
    const res = await request.post('/api/admin/newsletter', {
      data: {
        action: 'send',
        subject: 'Variante A',
        blocks: [{ id: 'b1', type: 'text', content: 'Hi from A/B' }],
        variants: [
          { label: 'A', subject: 'Variante A' },
          { label: 'B', subject: 'Variante B' },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.ok()).toBeTruthy()
    await res.body() // wait for stream to finish so all sends land in the capture file

    const sends = sendsOnly(await readSentEmails(request))
    // Seed has 5 confirmed subscribers — every one should get a mail.
    expect(sends.length).toBe(5)

    const subjects = sends.map((s) => s.payload.subject)
    const aCount = subjects.filter((s) => s === 'Variante A').length
    const bCount = subjects.filter((s) => s === 'Variante B').length
    expect(aCount + bCount).toBe(5)
    // Five subscribers split round-robin → 3/2 split (or 2/3), never all on one side.
    expect(Math.abs(aCount - bCount)).toBeLessThanOrEqual(1)
    expect(aCount).toBeGreaterThanOrEqual(2)
    expect(bCount).toBeGreaterThanOrEqual(2)

    // Every recipient is one of the seeded test addresses.
    const recipients = sends.map((s) => s.payload.to)
    for (const r of recipients) {
      expect(['alice@e2e.test', 'bob@e2e.test', 'carol@e2e.test', 'dave@e2e.test', 'eve@e2e.test']).toContain(r)
    }
    expect(new Set(recipients).size).toBe(5)
  })
})
