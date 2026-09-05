import { expect, test } from '@playwright/test';
import { runInNewContext } from 'node:vm';
import { persistMarketSnapshots } from '@/lib/providers/market/persist';
import type { getSql } from '@/lib/db';
import type { NormalizedMarketSnapshot } from '@/lib/providers/market/types';

test('market batches transport cross-realm Dates as timestamps and evidence as objects', async () => {
  const foreignDate = runInNewContext('new Date("2026-09-04T00:00:00Z")') as Date;
  expect(foreignDate instanceof Date).toBe(false);
  const calls: unknown[][] = [];
  const sql = (async (_strings: TemplateStringsArray, ...parameters: unknown[]) => {
    calls.push(parameters);
    // Reproduce the driver's rejected non-string parameter boundary.
    for (const value of parameters) Buffer.byteLength(value as string);
    return [{ id: 'stored' }];
  }) as unknown as NonNullable<ReturnType<typeof getSql>>;
  const quote: NormalizedMarketSnapshot = {
    symbol: 'AAPL', price: 319.97, volume: 100, dollarVolume: 31997,
    observedAt: foreignDate, source: 'nasdaq-delayed', isRealTime: false,
  };
  const inserted = await persistMarketSnapshots(sql, [quote, {...quote, symbol: 'UNKNOWN'}], new Map([['AAPL', 'sec-aapl']]), new Map([['sec-aapl', 1000]]));
  expect(inserted).toBe(1);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toHaveLength(1);
  const records = JSON.parse(Buffer.from(calls[0][0] as string, 'base64').toString('utf8'));
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    security_id: 'sec-aapl', observed_at: '2026-09-04T00:00:00.000Z',
    float_rotation: 0.1, payload: { livePull: false, evidenceClass: 'delayed-reference' },
  });
});
