import { expect, test } from '@playwright/test';
import { toJsonb } from '../../lib/db/json';

// Regression guard. sql.json() reached the driver unrecognised under the Next.js
// production bundle and threw ERR_INVALID_ARG_TYPE, which turned the entire cron
// cycle into an opaque 500 the moment a database was connected. Every jsonb
// parameter now goes through toJsonb and is cast in SQL instead.
test('objects and arrays serialise to JSON text, not driver wrappers', () => {
  expect(toJsonb({ a: 1 })).toBe('{"a":1}');
  expect(toJsonb([])).toBe('[]');
  expect(toJsonb([{ symbol: 'X' }])).toBe('[{"symbol":"X"}]');
  expect(typeof toJsonb({ a: 1 })).toBe('string');
});

test('null and undefined both become JSON null rather than throwing', () => {
  expect(toJsonb(null)).toBe('null');
  expect(toJsonb(undefined)).toBe('null');
});

test('nested values survive a round trip', () => {
  const value = { nested: { list: [1, 2, 3], flag: true }, when: '2026-08-28T00:00:00.000Z' };
  expect(JSON.parse(toJsonb(value))).toEqual(value);
});
