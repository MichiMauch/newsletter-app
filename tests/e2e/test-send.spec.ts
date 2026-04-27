import { test, expect } from '@playwright/test'
import { clearSentEmails, loginAsAdmin, readSentEmails, sendsOnly } from './helpers'

test.describe('admin: test-send', () => {
  test.beforeEach(async ({ request }) => {
    await loginAsAdmin(request)
    await clearSentEmails(request)
  })

  test('test-send delivers a single email with [TEST] prefix and preheader', async ({ request }) => {
    const res = await request.post('/api/admin/newsletter', {
      data: {
        action: 'test-send',
        subject: 'Hallo Welt',
        preheader: 'Vorschau-Test',
        blocks: [
          { id: 'b1', type: 'text', content: '<p>Hallo aus dem Test</p>' },
        ],
        testEmail: 'qa@e2e.test',
      },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.ok()).toBeTruthy()

    const sends = sendsOnly(await readSentEmails(request))
    expect(sends).toHaveLength(1)

    const sent = sends[0]
    expect(sent.payload.to).toBe('qa@e2e.test')
    expect(sent.payload.subject).toBe('[TEST] Hallo Welt')
    expect(String(sent.payload.html ?? '')).toContain('Hallo aus dem Test')
    // Hidden preheader text lives in a display:none container in the email head.
    expect(String(sent.payload.html ?? '')).toContain('Vorschau-Test')
  })

  test('test-send rejects an invalid email address', async ({ request }) => {
    const res = await request.post('/api/admin/newsletter', {
      data: {
        action: 'test-send',
        subject: 'X',
        blocks: [{ id: 'b1', type: 'text', content: 'X' }],
        testEmail: 'nope',
      },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(400)
    const sends = sendsOnly(await readSentEmails(request))
    expect(sends).toHaveLength(0)
  })

  test('test-send rejects empty subject', async ({ request }) => {
    const res = await request.post('/api/admin/newsletter', {
      data: {
        action: 'test-send',
        subject: '',
        blocks: [{ id: 'b1', type: 'text', content: 'X' }],
        testEmail: 'qa@e2e.test',
      },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(400)
  })
})
