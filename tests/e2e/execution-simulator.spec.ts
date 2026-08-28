import { expect, test } from '@playwright/test';
import { clampSimulatedFillPrice } from '../../lib/execution/simulator';

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
