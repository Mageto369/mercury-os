import { expect, test } from '@playwright/test';

test('admin suite is visible but protected when runtime admin token is absent', async ({ page, request }) => {
  const session = await request.get('/api/admin/session');
  expect(session.ok()).toBeTruthy();
  const body = await session.json();
  expect(body.authenticated).toBe(false);

  const settings = await request.get('/api/admin/settings');
  expect(settings.status()).toBe(401);

  await page.goto('/admin');
  await expect(page.getByText('Admin Suite')).toBeVisible();
  if (!body.configured) {
    await expect(page.getByText(/MERCURY_ADMIN_TOKEN is not configured/i)).toBeVisible();
  }
});
