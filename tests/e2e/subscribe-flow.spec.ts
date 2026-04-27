import { test, expect } from '@playwright/test'
import { clearSentEmails, readSentEmails, sendsOnly } from './helpers'

test.describe('public subscribe flow', () => {
  test.beforeEach(async ({ request }) => {
    await clearSentEmails(request)
  })

  test('disallowed origin gets no Access-Control-Allow-Origin header', async ({ request }) => {
    // CORS is enforced by the browser, not by the server — a direct request can
    // still reach the handler. What we *can* verify is that the proxy refuses to
    // echo the foreign Origin into Access-Control-Allow-Origin, so a real
    // browser would block the response.
    const res = await request.post('/api/v1/subscribe', {
      data: { email: 'origin-test@e2e.test' },
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://attacker.example',
      },
    })
    expect(res.headers()['access-control-allow-origin']).toBeUndefined()
    expect(res.status()).toBeLessThan(500)
  })

  test('valid signup triggers a confirmation email', async ({ request }) => {
    const res = await request.post('/api/v1/subscribe', {
      data: { email: 'newcomer@e2e.test' },
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:3100',
      },
    })
    expect(res.ok()).toBeTruthy()

    const sends = sendsOnly(await readSentEmails(request))
    expect(sends).toHaveLength(1)
    const sent = sends[0]
    expect(sent.payload.to).toBe('newcomer@e2e.test')
    expect(String(sent.payload.subject)).toMatch(/best.tige|bestätige/i)
    // Confirmation links must be present in the rendered body.
    expect(String(sent.payload.html ?? '')).toMatch(/\/newsletter\/bestaetigen\?token=/)
  })

  test('invalid email format is rejected without sending mail', async ({ request }) => {
    const res = await request.post('/api/v1/subscribe', {
      data: { email: 'not-an-email' },
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:3100',
      },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    const sends = sendsOnly(await readSentEmails(request))
    expect(sends).toHaveLength(0)
  })
})
