import { test, expect } from '@playwright/test';

test('paper suite renders core workspaces', async ({ page }) => {
  await page.goto('/paper');
  await expect(page.getByText('Paper Trading Terminal')).toBeVisible();
  await expect(page.getByText('PAPER MODE')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Trade' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Positions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Orders' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Performance' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Journal' })).toBeVisible();
});

test('paper mutations require admin session', async ({ request }) => {
  const order = await request.post('/api/paper/orders', { data: { symbol:'TEST', side:'buy', quantity:1, orderType:'market' } });
  expect([401,503]).toContain(order.status());
  const cancel = await request.delete('/api/paper/orders/paper:test');
  expect([401,503]).toContain(cancel.status());
  const reset = await request.post('/api/paper/account/reset');
  expect([401,503]).toContain(reset.status());
});

test('paper performance endpoint never enables capital', async ({ request }) => {
  const response = await request.get('/api/paper/performance');
  const body = await response.json();
  expect(body.capitalExecutionEnabled).toBe(false);
});
