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

test('production readiness, performance, and promotion gates are visible and fail-closed', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Production Readiness' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shadow Performance' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shadow Promotion Gate' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mercury Intelligence Lab' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Market Feed Fabric' })).toBeVisible();

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

  const promotion = await request.get('/api/activation/promotion');
  expect(promotion.ok()).toBeTruthy();
  const promotionJson = await promotion.json();
  expect(promotionJson.mode).toBe('shadow');
  expect(promotionJson.capitalExecutionEnabled).toBe(false);
  expect(promotionJson.qualifiedForPaperReview).toBe(false);
  expect(promotionJson.totalRules).toBe(5);
  expect(promotionJson.passedRules).toBeLessThan(5);
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

test('one-shot shadow activation is protected and fails closed before database activation', async ({ request }) => {
  const unauthorized = await request.post('/api/activation/launch');
  expect(unauthorized.status()).toBe(401);

  const authorized = await request.post('/api/activation/launch', {
    headers: { authorization: 'Bearer mercury-e2e-cron-secret' },
  });
  expect(authorized.status()).toBe(503);
  const json = await authorized.json();
  expect(json.ok).toBe(false);
  expect(json.phase).toBe('bootstrap');
  expect(json.mode).toBe('shadow');
  expect(json.capitalExecutionEnabled).toBe(false);
});

test('shadow performance remains explicit when persistence is unavailable', async ({ request }) => {
  const response = await request.get('/api/performance/shadow');
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.available).toBe(false);
  expect(json.reason).toBe('database_not_configured');
  expect(json.mode).toBe('shadow');
  expect(json.capitalExecutionEnabled).toBe(false);
  expect(json.horizons.m15.count).toBe(0);
  expect(json.horizons.m60.count).toBe(0);
});

test('market provider fabric exposes failover state and protected pulling', async ({ request }) => {
  const status = await request.get('/api/providers/market/status');
  expect(status.ok()).toBeTruthy();
  const statusJson = await status.json();
  expect(statusJson.mode).toBe('auto');
  expect(statusJson.capitalExecutionEnabled).toBe(false);
  expect(statusJson.providers).toHaveLength(2);
  expect(statusJson.providers.map((item: { name: string }) => item.name)).toEqual(['massive', 'intrinio']);
  expect(statusJson.providers.every((item: { configured: boolean }) => item.configured === false)).toBeTruthy();

  const unauthorized = await request.post('/api/providers/market/pull');
  expect(unauthorized.status()).toBe(401);

  const authorized = await request.post('/api/providers/market/pull', {
    headers: { authorization: 'Bearer mercury-e2e-cron-secret' },
  });
  expect(authorized.status()).toBe(503);
  const json = await authorized.json();
  expect(json.ok).toBe(false);
  expect(json.reason).toBe('database_not_configured');
});

test('institutional research APIs are explicit and fail closed without persistence', async ({ request }) => {
  const signals = await request.get('/api/research/signals');
  expect(signals.ok()).toBeTruthy();
  const signalsJson = await signals.json();
  expect(signalsJson.mode).toBe('shadow');
  expect(signalsJson.capitalExecutionEnabled).toBe(false);
  expect(signalsJson.count).toBeGreaterThanOrEqual(25);
  expect(signalsJson.families.length).toBeGreaterThanOrEqual(10);

  const evidence = await request.get('/api/performance/evidence');
  expect(evidence.ok()).toBeTruthy();
  expect((await evidence.json()).available).toBe(false);

  const models = await request.get('/api/models/governance');
  expect(models.ok()).toBeTruthy();
  const modelJson = await models.json();
  expect(modelJson.available).toBe(false);
  expect(modelJson.capitalExecutionEnabled).toBe(false);

  const killSwitches = await request.get('/api/risk/kill-switches');
  expect(killSwitches.ok()).toBeTruthy();
  const killJson = await killSwitches.json();
  expect(killJson.capitalExecutionEnabled).toBe(false);
  expect(killJson.criticalTrips).toBeGreaterThan(0);
  expect(killJson.switches.some((item: { key: string; tripped: boolean }) => item.key === 'database' && item.tripped)).toBeTruthy();

  const portfolio = await request.get('/api/portfolio/shadow');
  expect(portfolio.ok()).toBeTruthy();
  const portfolioJson = await portfolio.json();
  expect(portfolioJson.available).toBe(false);
  expect(portfolioJson.reason).toBe('database_not_configured');

  const sources = await request.get('/api/research/source-reputation');
  expect(sources.ok()).toBeTruthy();
  expect((await sources.json()).available).toBe(false);

  const twinsMissing = await request.get('/api/research/twins');
  expect(twinsMissing.status()).toBe(400);
  const twins = await request.get('/api/research/twins?opportunityId=shadow-test');
  expect(twins.ok()).toBeTruthy();
  expect((await twins.json()).available).toBe(false);
});

test('advanced write paths are protected', async ({ request }) => {
  for (const path of ['/api/performance/evidence', '/api/research/source-reputation', '/api/portfolio/shadow']) {
    const unauthorized = await request.post(path);
    expect(unauthorized.status()).toBe(401);
    const authorized = await request.post(path, { headers: { authorization: 'Bearer mercury-e2e-cron-secret' } });
    expect(authorized.status()).toBe(503);
  }
});
