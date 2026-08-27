import { expect, test } from '@playwright/test';

test('command center loads and key controls work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Calculated Aggression' })).toBeVisible();
  await expect(page.getByText('Maximum Market Outlook')).toBeVisible();
  await expect(page.getByText('Opportunity Command')).toBeVisible();

  await page.getByRole('button', { name: 'Social Radar' }).click();
  await expect(page.getByText('Social Radar workspace')).toBeVisible();

  const ranking = page.locator('select');
  await ranking.selectOption('gem');
  const firstTicker = page.locator('tbody tr').first().locator('td').first();
  await expect(firstTicker).toContainText('CRBN');

  await page.getByText('DRNX', { exact: true }).first().click();
  await expect(page.locator('.ticker-detail h2')).toContainText('DRNX');

  await page.getByRole('button', { name: /Run Intelligence Pulse/i }).click();
  await expect(page.getByRole('button', { name: /Run Intelligence Pulse/i })).toBeEnabled();
});

test('shadow APIs stay functional and execution remains disabled', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  const healthJson = await health.json();
  expect(healthJson.status).toBe('ok');
  expect(healthJson.service).toBe('mercury-os');

  const pulse = await request.post('/api/control/pulse');
  expect(pulse.ok()).toBeTruthy();
  const pulseJson = await pulse.json();
  expect(pulseJson.mode).toBe('shadow');
  expect(pulseJson.executionEnabled).toBe(false);

  const cron = await request.get('/api/cron/intelligence');
  expect(cron.ok()).toBeTruthy();
  const cronJson = await cron.json();
  expect(cronJson.mode).toBe('shadow');
  expect(cronJson.autonomousExecution).toBe(false);
});

test('mobile layout remains usable', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile project only');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Calculated Aggression' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Run Intelligence Pulse/i })).toBeVisible();
  await page.getByRole('button', { name: 'Risk' }).click();
  await expect(page.getByText('Risk workspace')).toBeVisible();
});
