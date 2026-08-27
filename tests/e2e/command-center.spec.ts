import { expect, test } from '@playwright/test';

const workspaces = [
  'Market Outlook',
  'Discovery',
  'Social Radar',
  'Opportunities',
  'Portfolio',
  'Risk',
  'Research',
  'Models',
  'Workflows',
  'Audit',
];

const allowedActions = new Set(['WATCH', 'GEM_WATCH', 'WAVE_ACTIVE', 'PRESS', 'REDUCE', 'EXIT', 'BLOCK']);

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

test('all workspaces are reachable without breaking the command center', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered by targeted mobile navigation test');
  await page.goto('/');

  for (const workspace of workspaces) {
    await page.getByRole('button', { name: workspace, exact: true }).click();
    await expect(page.getByText(`${workspace} workspace`)).toBeVisible();
    await expect(page.getByText('Opportunity Command')).toBeVisible();
  }
});

test('shadow APIs stay functional and execution remains disabled', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  const healthJson = await health.json();
  expect(healthJson.status).toBe('ok');
  expect(healthJson.service).toBe('mercury-os');
  expect(healthJson.version).toBe('0.3.1');
  expect(healthJson.totalProviders).toBe(9);

  const pulse = await request.post('/api/control/pulse');
  expect(pulse.ok()).toBeTruthy();
  const pulseJson = await pulse.json();
  expect(pulseJson.mode).toBe('shadow');
  expect(pulseJson.executionEnabled).toBe(false);

  const unauthorizedCron = await request.get('/api/cron/intelligence');
  expect(unauthorizedCron.status()).toBe(401);

  const cron = await request.get('/api/cron/intelligence', {
    headers: { authorization: 'Bearer mercury-e2e-cron-secret' },
  });
  expect(cron.ok()).toBeTruthy();
  const cronJson = await cron.json();
  expect(cronJson.mode).toBe('shadow');
  expect(cronJson.autonomousExecution).toBe(false);
  expect(Array.isArray(cronJson.jobs)).toBeTruthy();

  const opportunities = await request.get('/api/opportunities');
  expect(opportunities.ok()).toBeTruthy();
  const opportunityJson = await opportunities.json();
  expect(Array.isArray(opportunityJson.opportunities)).toBeTruthy();
  expect(opportunityJson.opportunities.length).toBeGreaterThan(0);

  let priorAsymmetry = 101;
  for (const item of opportunityJson.opportunities) {
    const decision = item.decision;
    expect(decision.alpha).toBeGreaterThanOrEqual(0);
    expect(decision.alpha).toBeLessThanOrEqual(100);
    expect(decision.asymmetry).toBeGreaterThanOrEqual(0);
    expect(decision.asymmetry).toBeLessThanOrEqual(100);
    expect(decision.aggression).toBeGreaterThanOrEqual(0);
    expect(decision.aggression).toBeLessThanOrEqual(5);
    expect(allowedActions.has(decision.action)).toBeTruthy();
    expect(decision.asymmetry).toBeLessThanOrEqual(priorAsymmetry);
    priorAsymmetry = decision.asymmetry;
  }
});

test('mobile layout remains usable', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile project only');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Calculated Aggression' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Run Intelligence Pulse/i })).toBeVisible();

  for (const workspace of ['Risk', 'Social Radar', 'Workflows']) {
    await page.getByRole('button', { name: workspace, exact: true }).click();
    await expect(page.getByText(`${workspace} workspace`)).toBeVisible();
  }
});
