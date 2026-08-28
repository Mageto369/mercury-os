import { expect, test } from '@playwright/test';

const publicGetRoutes = [
  '/api/activation/promotion',
  '/api/activation/readiness',
  '/api/agents',
  '/api/agents/health',
  '/api/autonomy/status',
  '/api/events/recent',
  '/api/gems',
  '/api/health',
  '/api/integrations/open-intelligence',
  '/api/integrations/repositories/status',
  '/api/integrations/research-proof',
  '/api/intelligence/deep',
  '/api/market/liquidity',
  '/api/market/regime',
  '/api/models/governance',
  '/api/opportunities',
  '/api/performance/evidence',
  '/api/performance/shadow',
  '/api/portfolio/shadow',
  '/api/providers/market/status',
  '/api/providers/open-data/status',
  '/api/research/history',
  '/api/research/signals',
  '/api/research/source-reputation',
  '/api/risk/kill-switches',
  '/api/social/trends',
  '/api/universe',
] as const;

test('all public report/status routes return a deliberate non-5xx contract', async ({ request }) => {
  for (const path of publicGetRoutes) {
    const response = await request.get(path);
    expect(response.status(), `${path} unexpectedly returned ${response.status()}`).toBeLessThan(500);
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType, `${path} must return JSON`).toContain('application/json');
  }
});

test('Phase M economic proof is protected and fails closed without persistence', async ({ request }) => {
  const unauthorized = await request.post('/api/research/economic-proof');
  expect(unauthorized.status()).toBe(401);

  const authorized = await request.post('/api/research/economic-proof', {
    headers: { authorization: 'Bearer mercury-e2e-cron-secret' },
  });
  expect(authorized.status()).toBe(503);
  const json = await authorized.json();
  expect(json.ok).toBe(false);
  expect(json.reason).toBe('database_not_configured');
  expect(json.capitalExecutionEnabled).toBe(false);
});

test('high-impact mutation routes reject unauthenticated calls', async ({ request }) => {
  const protectedPosts = [
    '/api/activation/launch',
    '/api/admin/bootstrap',
    '/api/admin/seed-validation',
    '/api/agents/run',
    '/api/autonomy/run',
    '/api/providers/market/pull',
    '/api/providers/open-data/pull',
    '/api/integrations/open-intelligence',
    '/api/integrations/research-proof',
    '/api/intelligence/deep',
    '/api/performance/evidence',
    '/api/portfolio/shadow',
    '/api/research/economic-proof',
    '/api/research/history',
    '/api/research/source-reputation',
  ] as const;

  for (const path of protectedPosts) {
    const response = await request.post(path);
    expect(response.status(), `${path} must reject unauthenticated mutation`).toBe(401);
  }
});

test('capital execution remains disabled across critical reports', async ({ request }) => {
  const routes = [
    '/api/activation/promotion',
    '/api/activation/readiness',
    '/api/agents/health',
    '/api/intelligence/deep',
    '/api/models/governance',
    '/api/performance/shadow',
    '/api/providers/market/status',
    '/api/risk/kill-switches',
  ] as const;

  for (const path of routes) {
    const response = await request.get(path);
    expect(response.status()).toBeLessThan(500);
    const json = await response.json();
    if ('capitalExecutionEnabled' in json) expect(json.capitalExecutionEnabled, path).toBe(false);
  }
});
