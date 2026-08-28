import { expect, test } from '@playwright/test';

test('security headers are present on application responses', async ({ request }) => {
  const response = await request.get('/');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['permissions-policy']).toContain('camera=()');
});

test('api responses disable caching', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('control-plane mutations reject missing or invalid bearer credentials', async ({ request }) => {
  const cases: Array<{ path: string; method: 'GET' | 'POST'; data?: unknown }> = [
    { path: '/api/agents/run', method: 'POST', data: { jobs: ['market-regime'] } },
    { path: '/api/autonomy/run', method: 'POST', data: { job: 'market-regime' } },
    { path: '/api/universe', method: 'POST', data: { symbol: 'SAFE', market: 'NASDAQ' } },
    { path: '/api/cron/intelligence', method: 'GET' },
  ];

  for (const item of cases) {
    const missing = item.method === 'GET'
      ? await request.get(item.path)
      : await request.post(item.path, { data: item.data });
    expect(missing.status()).toBe(401);

    const invalid = item.method === 'GET'
      ? await request.get(item.path, { headers: { authorization: 'Bearer definitely-wrong' } })
      : await request.post(item.path, { headers: { authorization: 'Bearer definitely-wrong' }, data: item.data });
    expect(invalid.status()).toBe(401);
  }
});

test('dashboard pulse is explicitly non-executing', async ({ request }) => {
  const response = await request.post('/api/control/pulse');
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.executionEnabled).toBe(false);
  expect(json.controlEffect).toBe('schedule_preview_only');
  expect(json.jobs.every((job: { status: string }) => job.status === 'due')).toBeTruthy();
});
