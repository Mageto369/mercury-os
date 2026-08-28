import { expect, test } from '@playwright/test';

test('open data mesh exposes authoritative provider contract without persistence', async ({ request }) => {
  const status = await request.get('/api/providers/open-data/status');
  expect(status.ok()).toBeTruthy();
  const json = await status.json();
  expect(json.available).toBe(false);
  expect(json.reason).toBe('database_not_configured');
  expect(json.mode).toBe('shadow');
  expect(json.capitalExecutionEnabled).toBe(false);
  expect(json.providers).toHaveLength(3);
  expect(json.providers.find((p: { provider: string }) => p.provider === 'sec-companyfacts').authoritative).toBe(true);
  expect(json.providers.find((p: { provider: string }) => p.provider === 'finra-regsho').authoritative).toBe(true);
  expect(json.providers.find((p: { provider: string }) => p.provider === 'openbb').authoritative).toBe(false);
});

test('open data pull is protected and fails closed without database', async ({ request }) => {
  const unauthorized = await request.post('/api/providers/open-data/pull');
  expect(unauthorized.status()).toBe(401);
  const authorized = await request.post('/api/providers/open-data/pull', {
    headers: { authorization: 'Bearer mercury-e2e-cron-secret' },
  });
  expect(authorized.status()).toBe(503);
  const json = await authorized.json();
  expect(json.ok).toBe(false);
  expect(json.capitalExecutionEnabled).toBe(false);
});
