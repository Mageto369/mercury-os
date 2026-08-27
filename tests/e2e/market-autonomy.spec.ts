import { expect, test } from '@playwright/test';

test('market autonomy endpoints fail closed without persistent data', async ({ request }) => {
  const liquidity = await request.get('/api/market/liquidity');
  expect(liquidity.ok()).toBeTruthy();
  const liquidityJson = await liquidity.json();
  expect(liquidityJson.persistent).toBe(false);
  expect(liquidityJson.snapshotsChecked).toBe(0);
  expect(liquidityJson.signals).toEqual([]);

  const regime = await request.get('/api/market/regime');
  expect(regime.ok()).toBeTruthy();
  const regimeJson = await regime.json();
  expect(regimeJson.persistent).toBe(false);
  expect(regimeJson.snapshotsChecked).toBe(0);
  expect(regimeJson.regime).toBeNull();

  const signal = {
    symbol: 'TEST',
    price: 0.05,
    volume: 100000,
    dollarVolume: 5000,
    bid: 0.049,
    ask: 0.051,
    rvol: 2.4,
    floatRotation: 0.7,
    observedAt: new Date().toISOString(),
  };

  const unauthorized = await request.post('/api/ingest/market', { data: { signals: [signal] } });
  expect(unauthorized.status()).toBe(401);

  const unavailable = await request.post('/api/ingest/market', {
    headers: { authorization: 'Bearer mercury-e2e-cron-secret' },
    data: { signals: [signal] },
  });
  expect(unavailable.status()).toBe(503);
});

test('manual market workers stay shadow-only when data infrastructure is absent', async ({ request }) => {
  for (const job of ['liquidity-pulse', 'market-regime']) {
    const response = await request.post('/api/autonomy/run', {
      headers: { authorization: 'Bearer mercury-e2e-cron-secret' },
      data: { job },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.mode).toBe('shadow');
    expect(data.capitalExecutionEnabled).toBe(false);
    expect(data.result.name).toBe(job);
    expect(data.result.status).toBe('skipped');
    expect(data.result.missingProviders).toContain('database');
  }
});
