import { test, expect } from '@playwright/test'
import { ADMIN_PASSWORD } from './helpers'

test.describe('admin login', () => {
  test('rejects an empty password', async ({ request }) => {
    const res = await request.post('/api/admin/login', {
      data: { password: '' },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(401)
  })

  test('rejects a wrong password', async ({ request }) => {
    const res = await request.post('/api/admin/login', {
      data: { password: 'definitely-wrong' },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(401)
  })

  test('accepts the seeded password and sets a session cookie', async ({ request }) => {
    const res = await request.post('/api/admin/login', {
      data: { password: ADMIN_PASSWORD },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.ok()).toBeTruthy()
    const setCookie = res.headers()['set-cookie'] ?? ''
    expect(setCookie).toMatch(/admin_session=/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Strict/i)
  })

  test('admin API rejects unauthenticated requests', async ({ request }) => {
    // New context without cookies — uses Playwright default, no prior login.
    const res = await request.get('/api/admin/newsletter', {
      headers: { Cookie: '' }, // ensure no cookie carryover
    })
    expect(res.status()).toBe(401)
  })
})
