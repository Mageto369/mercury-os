import { expect, test } from '@playwright/test';

const workspaces = [
  ['Command', 'Calculated Aggression'],
  ['Market Outlook', 'Market Outlook'],
  ['Discovery', 'Discovery'],
  ['Social Radar', 'Social Radar'],
  ['Opportunities', 'Opportunities'],
  ['Portfolio', 'Portfolio'],
  ['Risk', 'Risk'],
  ['Research', 'Research'],
  ['Models', 'Models'],
  ['Workflows', 'Workflows'],
  ['Audit', 'Audit'],
] as const;

test('every dashboard navigation item opens a functional workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Calculated Aggression' })).toBeVisible();

  for (const [button, heading] of workspaces) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByText(`${button} workspace`, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }
});

test('intelligence pulse invokes backend and dashboard remains interactive', async ({ page }) => {
  await page.goto('/');
  const responsePromise = page.waitForResponse((response) => response.url().includes('/api/control/pulse') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Run Intelligence Pulse/i }).click();
  const response = await responsePromise;
  expect(response.status()).toBeLessThan(500);
  await expect(page.getByRole('button', { name: /Run Intelligence Pulse/i })).toBeEnabled();
});

test('opportunity workspace never labels validation data as live evidence', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Opportunities', exact: true }).click();
  await expect(page.getByText(/validation:/i)).toHaveCount(0);
});

test('report panels expose their full backend report', async ({ page }) => {
  await page.goto('/');
  const summaries = page.locator('summary', { hasText: 'View full report' });
  await expect(summaries.first()).toBeVisible();
  await summaries.first().click();
  await expect(page.locator('pre').first()).toBeVisible();
});
