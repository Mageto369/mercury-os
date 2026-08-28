import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

const pages = [
  ['/', 'Mercury'],
  ['/paper', 'Paper Trading'],
  ['/market', 'Market Intelligence'],
  ['/ai', 'AI'],
  ['/research-lab', 'Research'],
  ['/operations', 'Operations'],
  ['/admin', 'Admin'],
] as const;

const readApis = [
  '/api/health',
  '/api/paper/terminal',
  '/api/paper/risk',
  '/api/paper/performance',
  '/api/market/intelligence',
  '/api/operations',
  '/api/research/lab',
] as const;

async function burst(request: APIRequestContext, url: string, count: number) {
  const started = Date.now();
  const responses = await Promise.all(Array.from({ length: count }, () => request.get(url)));
  return { responses, elapsedMs: Date.now() - started };
}

test.describe('extreme controlled stress', () => {
  test('all primary workspaces survive repeated parallel navigation', async ({ browser }) => {
    test.setTimeout(120_000);
    for (const [path, marker] of pages) {
      const contexts = await Promise.all(Array.from({ length: 6 }, () => browser.newContext()));
      const results = await Promise.all(contexts.map(async (context) => {
        const page = await context.newPage();
        const response = await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const body = await page.locator('body').innerText();
        await context.close();
        return { status: response?.status() ?? 0, body };
      }));
      for (const result of results) {
        expect(result.status, `${path} should render`).toBeLessThan(500);
        expect(result.body.toLowerCase()).toContain(marker.toLowerCase());
      }
    }
  });

  test('read APIs tolerate sustained concurrent bursts without server crashes', async ({ request }) => {
    test.setTimeout(120_000);
    for (const url of readApis) {
      const { responses, elapsedMs } = await burst(request, url, 40);
      for (const response of responses) {
        expect(response.status(), `${url} returned ${response.status()}`).toBeLessThan(600);
        expect([200, 400, 401, 403, 404, 409, 429, 503]).toContain(response.status());
      }
      expect(elapsedMs, `${url} burst exceeded 45s`).toBeLessThan(45_000);
    }
  });

  test('protected mutation surfaces fail closed under unauthorized bursts', async ({ request }) => {
    test.setTimeout(120_000);
    const attempts: Promise<APIResponse>[] = [];
    for (let i = 0; i < 30; i++) {
      attempts.push(request.post('/api/paper/orders', { data: { symbol: 'TEST', side: 'buy', quantity: 1, orderType: 'market' } }));
      attempts.push(request.post('/api/paper/risk', { data: { symbol: 'TEST', conviction: 50 } }));
      attempts.push(request.post('/api/research/copilot', { data: { symbol: 'TEST', question: 'stress probe', mode: 'copilot' } }));
      attempts.push(request.post('/api/research/lab', { data: { action: 'experiment', hypothesis: 'stress probe' } }));
      attempts.push(request.post('/api/operations/notifications', { data: { ruleKey: 'stress', enabled: true } }));
    }
    const responses = await Promise.all(attempts);
    for (const response of responses) {
      expect([400, 401, 403, 404, 405, 409, 429, 503]).toContain(response.status());
      expect(response.ok()).toBe(false);
    }
  });

  test('malformed and oversized requests fail deliberately without unhandled 500s', async ({ request }) => {
    const hugeSymbol = 'X'.repeat(5000);
    const cases = [
      request.get(`/api/market/intelligence?symbol=${hugeSymbol}`),
      request.post('/api/paper/orders', { headers: { 'content-type': 'application/json' }, data: { symbol: hugeSymbol, side: 'buy', quantity: -1, orderType: 'limit' } }),
      request.post('/api/research/copilot', { data: { symbol: hugeSymbol, question: 'x'.repeat(20_000), mode: 'copilot' } }),
    ];
    const responses = await Promise.all(cases);
    for (const response of responses) {
      expect(response.status()).not.toBe(500);
      expect(response.status()).toBeLessThan(600);
    }
  });

  test('capital authority remains false across high-frequency reads', async ({ request }) => {
    const responses = await Promise.all(Array.from({ length: 50 }, () => request.get('/api/health')));
    for (const response of responses) {
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.runtime?.capitalExecutionEnabled).toBe(false);
      expect(body.runtime?.mode).toBe('shadow');
    }
  });
});
