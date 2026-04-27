import { test, expect } from '@playwright/test'
import { clearSentEmails, loginAsAdmin, readSentEmails, sendsOnly } from './helpers'

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

  test('clicking the confirmation link confirms the subscriber and redirects', async ({ request }) => {
    // 1. Subscribe
    const subRes = await request.post('/api/v1/subscribe', {
      data: { email: 'confirm-flow@e2e.test' },
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:3100' },
    })
    expect(subRes.ok()).toBeTruthy()

    // 2. Extract confirm token from the captured mail
    const sends = sendsOnly(await readSentEmails(request))
    expect(sends).toHaveLength(1)
    const html = String(sends[0].payload.html ?? '')
    const match = html.match(/\/newsletter\/bestaetigen\?token=([^"&\s]+)/)
    expect(match, 'confirm link with token must be present in mail').not.toBeNull()
    const token = match![1]
    // HMAC tokens are >40 chars (payload + 32-byte sig in base64url); UUIDs are 36
    expect(token.length).toBeGreaterThan(36)

    // 3. Hit the confirmation URL — must redirect to /newsletter/bestaetigt on success
    const confirmRes = await request.get(`/newsletter/bestaetigen?token=${token}`, { maxRedirects: 0 })
    expect(confirmRes.status()).toBe(307)
    expect(confirmRes.headers()['location']).toContain('/newsletter/bestaetigt')

    // 4. A second click must NOT re-confirm (idempotency: row is no longer 'pending')
    //    The page renders ErrorMessage with status 200 instead of redirecting.
    const reclickRes = await request.get(`/newsletter/bestaetigen?token=${token}`, { maxRedirects: 0 })
    expect(reclickRes.status()).toBe(200)
  })

  test('clicking with a tampered token shows the error page', async ({ request }) => {
    const res = await request.get('/newsletter/bestaetigen?token=this-is-not-a-valid-token', {
      maxRedirects: 0,
    })
    expect(res.status()).toBe(200) // ErrorMessage page, not a redirect
    const body = await res.text()
    expect(body).toMatch(/Ungültiger Link/)
  })

  test('subscribe + confirm record IP and User-Agent for GDPR Art. 7.1', async ({ request }) => {
    const email = `gdpr-trail-${Date.now()}@e2e.test`
    const userAgent = 'Mozilla/5.0 (compat; e2e-gdpr-trail-probe)'

    // 1. Subscribe with a recognizable User-Agent
    const subRes = await request.post('/api/v1/subscribe', {
      data: { email },
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:3100', 'User-Agent': userAgent },
    })
    expect(subRes.ok()).toBeTruthy()

    // 2. Pull the captured confirm link
    const sends = sendsOnly(await readSentEmails(request))
    const sent = sends[sends.length - 1]
    const html = String(sent.payload.html ?? '')
    const match = html.match(/\/newsletter\/bestaetigen\?token=([^"&\s]+)/)
    expect(match).not.toBeNull()
    const token = match![1]

    // 3. Confirm with a different User-Agent so we can tell the two apart
    const confirmUA = 'Mozilla/5.0 (compat; e2e-gdpr-trail-confirm)'
    const confirmRes = await request.get(`/newsletter/bestaetigen?token=${token}`, {
      headers: { 'User-Agent': confirmUA },
      maxRedirects: 0,
    })
    expect(confirmRes.status()).toBe(307)

    // 4. Inspect the admin profile and verify both trails landed
    await loginAsAdmin(request)
    const profileRes = await request.get(`/api/admin/subscriber?email=${encodeURIComponent(email)}`)
    expect(profileRes.ok()).toBeTruthy()
    const profile = await profileRes.json()
    expect(profile.subscriber.subscribedIp, 'subscribed_ip must be populated').toBeTruthy()
    expect(profile.subscriber.subscribedUserAgent).toBe(userAgent)
    expect(profile.subscriber.confirmedIp, 'confirmed_ip must be populated').toBeTruthy()
    expect(profile.subscriber.confirmedUserAgent).toBe(confirmUA)
  })
})
