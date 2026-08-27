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
