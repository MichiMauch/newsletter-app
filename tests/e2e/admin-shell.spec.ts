import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

// Page tests need a generous timeout: Turbopack compiles the admin shell on
// first request, which can take a few seconds on a cold dev server.
const PAGE_VISIBLE = { timeout: 20_000 }

test.describe('admin shell', () => {
  test('login form renders for unauthenticated visitor', async ({ page }) => {
    const response = await page.goto('/admin/newsletter')
    expect(response?.ok()).toBeTruthy()
    // Form labels aren't bound via htmlFor, so match on input types + button.
    await expect(page.locator('input[type="email"]')).toBeVisible(PAGE_VISIBLE)
    await expect(page.locator('input[type="password"]')).toBeVisible(PAGE_VISIBLE)
    await expect(page.getByRole('button', { name: /Anmelden/i })).toBeVisible(PAGE_VISIBLE)
  })

  test('after login the dashboard shell is visible', async ({ page, request }) => {
    await loginAsAdmin(request)
    const cookies = await request.storageState()
    await page.context().addCookies(cookies.cookies)

    await page.goto('/admin/newsletter')
    // Sidebar starts collapsed: text labels are hidden, the only stable
    // identifier per link is the `title` attribute set on the icon button.
    await expect(page.locator('a[title="Dashboard"]')).toBeVisible(PAGE_VISIBLE)
    await expect(page.locator('a[title="Send Center"]')).toBeVisible(PAGE_VISIBLE)
    await expect(page.locator('a[title="Abonnenten"]')).toBeVisible(PAGE_VISIBLE)
  })
})
