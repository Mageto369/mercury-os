import { expect, test } from '@playwright/test';

test('open intelligence sidecar is explicit and fail-closed', async ({ request }) => {
  const status = await request.get('/api/integrations/open-intelligence');
  expect(status.ok()).toBeTruthy();
  const statusJson = await status.json();
  expect(statusJson.configured).toBe(false);
  expect(statusJson.reachable).toBe(false);
  expect(statusJson.capitalExecutionEnabled).toBe(false);

  const unauthorized = await request.post('/api/integrations/open-intelligence');
  expect(unauthorized.status()).toBe(401);

  const authorized = await request.post('/api/integrations/open-intelligence', {
    headers: { authorization: 'Bearer mercury-e2e-cron-secret' },
  });
  expect(authorized.status()).toBe(503);
  const json = await authorized.json();
  expect(json.ok).toBe(false);
  expect(json.reason).toBe('database_not_configured');
});
