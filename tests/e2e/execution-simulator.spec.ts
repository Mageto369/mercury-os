import { expect, test } from '@playwright/test';
import {
  ASSUMED_RVOL,
  ASSUMED_SPREAD_BPS,
  executionQuoteAssumptions,
} from '../../lib/execution/quote-assumptions';
import {
  clampSimulatedFillPrice,
  simulateExecution,
} from '../../lib/execution/simulator';

test('simulated limit fills never violate the requested price', () => {
  expect(clampSimulatedFillPrice('limit', 'buy', 10.25, 10)).toBe(10);
  expect(clampSimulatedFillPrice('limit', 'sell', 9.75, 10)).toBe(10);

  expect(clampSimulatedFillPrice('limit', 'buy', 9.75, 10)).toBe(9.75);
  expect(clampSimulatedFillPrice('limit', 'sell', 10.25, 10)).toBe(10.25);
});

test('simulated market fills preserve the slipped price', () => {
  expect(clampSimulatedFillPrice('market', 'buy', 10.25, 10)).toBe(10.25);
  expect(clampSimulatedFillPrice('market', 'sell', 9.75, 10)).toBe(9.75);
});

test('execution simulation remains finite and bounded for pathological inputs', () => {
  const result = simulateExecution({
    notional: Number.POSITIVE_INFINITY,
    price: Number.NaN,
    dollarVolume: 0,
    spreadBps: -100,
    rvol: Number.POSITIVE_INFINITY,
    floatRotation: Number.POSITIVE_INFINITY,
    volatilityScore: Number.POSITIVE_INFINITY,
  });

  expect(Object.values(result).every((value) => {
    if (typeof value === 'number') return Number.isFinite(value);
    return true;
  })).toBe(true);
  expect(result.capacityExceeded).toBe(true);
  expect(result.estimatedFillProbabilityPct).toBeGreaterThanOrEqual(5);
  expect(result.estimatedFillProbabilityPct).toBeLessThanOrEqual(100);
  expect(['low', 'moderate', 'high', 'extreme']).toContain(result.discontinuityRisk);
});

test('zero-notional execution has zero participation and remains fill-capable', () => {
  const result = simulateExecution({
    notional: 0,
    price: 10,
    dollarVolume: 1_000_000,
    spreadBps: 20,
    rvol: 1,
    floatRotation: 0,
  });

  expect(result.participationRatePct).toBe(0);
  expect(result.capacityExceeded).toBe(false);
  expect(result.estimatedCapacityNotional).toBeGreaterThan(0);
  expect(result.estimatedFillProbabilityPct).toBeGreaterThan(0);
});

test('a quote with no spread is not simulated as a locked market', () => {
  const assumptions = executionQuoteAssumptions({ spread_bps: null, rvol: null, float_rotation: null });
  expect(assumptions.spreadBps).toBe(ASSUMED_SPREAD_BPS);
  expect(assumptions.rvol).toBe(ASSUMED_RVOL);
  expect(assumptions.spreadSource).toBe('assumed');
  const quoted = simulateExecution({ notional: 10_000, price: 50, dollarVolume: 1_000_000, spreadBps: 0, rvol: 1, floatRotation: 0 });
  const assumed = simulateExecution({ notional: 10_000, price: 50, dollarVolume: 1_000_000, spreadBps: assumptions.spreadBps, rvol: assumptions.rvol, floatRotation: assumptions.floatRotation });
  expect(assumed.estimatedOneWayCostBps).toBeGreaterThan(quoted.estimatedOneWayCostBps);
});

test('capacity tightens as volatility rises', () => {
  const calm = simulateExecution({
    notional: 1_000,
    price: 10,
    dollarVolume: 100_000,
    spreadBps: 10,
    volatilityScore: 20,
  });
  const stressed = simulateExecution({
    notional: 1_000,
    price: 10,
    dollarVolume: 100_000,
    spreadBps: 10,
    volatilityScore: 90,
  });

  expect(stressed.estimatedCapacityNotional).toBeLessThan(calm.estimatedCapacityNotional);
  expect(stressed.estimatedOneWayCostBps).toBeGreaterThan(calm.estimatedOneWayCostBps);
});
