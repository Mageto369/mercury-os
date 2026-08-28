import { test, expect } from '@playwright/test';

test('paper trading terminal is accessible and explicitly non-capital', async ({ page }) => {
  await page.goto('/paper');
  await expect(page.getByRole('heading', { name: 'Paper Trading Terminal' })).toBeVisible();
  await expect(page.getByText('PAPER MODE')).toBeVisible();
  await expect(page.getByText('REAL CAPITAL LOCKED')).toBeVisible();
  await expect(page.getByText('Capital', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Orders' }).click();
  await expect(page.getByRole('heading', { name: 'Paper Order Management' })).toBeVisible();
  await page.getByRole('button', { name: 'Risk' }).click();
  await expect(page.getByRole('heading', { name: 'Risk Controls' })).toBeVisible();
  await expect(page.getByText('BLOCKED')).toBeVisible();
});

test('paper terminal API never enables capital execution', async ({ request }) => {
  const response = await request.get('/api/paper/terminal');
  expect([200, 503]).toContain(response.status());
  const body = await response.json();
  expect(body.mode).toBe('paper');
  expect(body.capitalExecutionEnabled).toBe(false);
  expect(Array.isArray(body.orders)).toBe(true);
});

test('command center exposes paper trading entry point', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Open Paper Trading' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/paper');
});
