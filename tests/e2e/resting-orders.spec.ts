import { expect, test } from '@playwright/test';
import { crossesLimit, dayOrderExpired, LEDGER_DECIMALS, OPEN_STATUSES, toLedgerAmount } from '../../lib/paper/order-engine';
import { clampSimulatedFillPrice } from '../../lib/execution/simulator';

test.describe('resting limit order crossing', () => {
  test('a buy crosses only when its limit reaches the offer', () => {
    expect(crossesLimit('buy', 1.05, 1.00)).toBe(true);
    expect(crossesLimit('buy', 1.00, 1.00)).toBe(true);
    expect(crossesLimit('buy', 0.99, 1.00)).toBe(false);
  });

  test('a sell crosses only when its limit reaches the bid', () => {
    expect(crossesLimit('sell', 0.95, 1.00)).toBe(true);
    expect(crossesLimit('sell', 1.00, 1.00)).toBe(true);
    expect(crossesLimit('sell', 1.01, 1.00)).toBe(false);
  });

  test('a resting fill can never print through its own limit', () => {
    // Slippage is applied after the cross, so the clamp is what keeps the fill
    // inside the limit the operator actually set.
    expect(clampSimulatedFillPrice('limit', 'buy', 1.20, 1.00)).toBe(1.00);
    expect(clampSimulatedFillPrice('limit', 'sell', 0.80, 1.00)).toBe(1.00);
    expect(clampSimulatedFillPrice('limit', 'buy', 0.90, 1.00)).toBe(0.90);
    expect(clampSimulatedFillPrice('limit', 'sell', 1.10, 1.00)).toBe(1.10);
  });
});

test.describe('time in force', () => {
  const now = new Date('2026-08-28T14:00:00.000Z');

  test('a day order submitted today has not expired', () => {
    expect(dayOrderExpired('2026-08-28T09:30:00.000Z', now)).toBe(false);
    expect(dayOrderExpired('2026-08-28T23:59:59.000Z', now)).toBe(false);
  });

  test('a day order from an earlier session has expired', () => {
    expect(dayOrderExpired('2026-08-27T20:00:00.000Z', now)).toBe(true);
    expect(dayOrderExpired('2025-01-01T00:00:00.000Z', now)).toBe(true);
  });

  test('an unparseable timestamp never silently expires an order', () => {
    expect(dayOrderExpired('not-a-date', now)).toBe(false);
  });

  test('a Date and its ISO string are treated identically', () => {
    expect(dayOrderExpired(new Date('2026-08-27T20:00:00.000Z'), now)).toBe(true);
  });
});

test('the cancellable statuses and the resting statuses are the same set', () => {
  // The cancel route and the settlement sweep must agree on what "resting"
  // means, or an order could be settled after it was cancelled.
  expect([...OPEN_STATUSES]).toEqual(['open', 'pending', 'partially_filled']);
});

test.describe('ledger precision', () => {
  test('amounts are rounded to the precision the ledger actually stores', () => {
    expect(LEDGER_DECIMALS).toBe(4);
    expect(toLedgerAmount(326.66651679999994)).toBe(326.6665);
    expect(toLedgerAmount(0.00005)).toBe(0.0001);
    expect(toLedgerAmount(-1.120954)).toBe(-1.1210);
    expect(toLedgerAmount(100)).toBe(100);
  });

  test('a run of fills stays exactly reconstructible from the rounded amounts', () => {
    // Letting Postgres round each full-precision update instead lost a fraction
    // of a cent per fill, so the balance drifted from the order rows.
    const fills = Array.from({ length: 12 }, () => 300 * 26.11825792);
    let cash = 100000;
    let audited = 100000;
    for (const fill of fills) {
      const amount = toLedgerAmount(fill);
      cash = toLedgerAmount(cash - amount);
      audited -= amount;
    }
    expect(cash).toBe(toLedgerAmount(audited));
  });
});
