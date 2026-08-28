import { test, expect } from '@playwright/test';

test('paper order mutation is protected and never exposes broker execution', async ({ request }) => {
  const response = await request.post('/api/paper/orders', {
    data: { symbol: 'TEST', side: 'buy', quantity: 1, orderType: 'market' },
  });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.error).toBe('admin_session_required');
});

test('paper terminal exposes trade workspace', async ({ page }) => {
  await page.goto('/paper');
  await expect(page.getByRole('heading', { name: 'Paper Trading Terminal' })).toBeVisible();
  await page.getByRole('button', { name: 'Trade' }).click();
  await expect(page.getByRole('heading', { name: 'Paper Order Ticket' })).toBeVisible();
  await expect(page.getByText('NO BROKER ROUTING')).toBeVisible();
});
