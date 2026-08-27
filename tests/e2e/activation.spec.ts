import { expect, test } from '@playwright/test';

test('database bootstrap is protected and fails closed without a database', async ({ request }) => {
  const unauthorized = await request.post('/api/admin/bootstrap');
  expect(unauthorized.status()).toBe(401);

  const unavailable = await request.post('/api/admin/bootstrap', {
    headers: { authorization: 'Bearer mercury-e2e-cron-secret' },
  });
  expect(unavailable.status()).toBe(503);
  const json = await unavailable.json();
  expect(json.ok).toBe(false);
  expect(json.reason).toBe('database_not_configured');
});

test('agent heartbeat health reports persistent state truthfully', async ({ request }) => {
  const response = await request.get('/api/agents/health');
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.mode).toBe('shadow');
  expect(json.capitalExecutionEnabled).toBe(false);
  expect(json.persistent).toBe(false);
  expect(json.agents).toHaveLength(12);
  expect(json.stale).toBe(12);
  for (const agent of json.agents) {
    expect(agent.status).toBe('never_run');
    expect(agent.stale).toBe(true);
    expect(agent.consecutiveFailures).toBe(0);
  }
});

test('production readiness is visible and fail-closed without infrastructure', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Production Readiness' })).toBeVisible();

  const response = await request.get('/api/activation/readiness');
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.mode).toBe('shadow');
  expect(json.capitalExecutionEnabled).toBe(false);
  expect(json.score).toBeGreaterThanOrEqual(0);
  expect(json.score).toBeLessThanOrEqual(100);
  expect(json.level).toBe('offline');
  expect(json.blockers).toContain('database');
  expect(json.blockers).toContain('market');
  expect(json.gates).toHaveLength(5);
});

test('validation universe seeding is protected and requires Postgres', async ({ request }) => {
  const unauthorized = await request.post('/api/admin/seed-validation');
  expect(unauthorized.status()).toBe(401);

  const authorized = await request.post('/api/admin/seed-validation', {
    headers: { authorization: 'Bearer mercury-e2e-cron-secret' },
  });
  expect(authorized.status()).toBe(503);
  const json = await authorized.json();
  expect(json.ok).toBe(false);
  expect(json.reason).toBe('database_not_configured');
});
