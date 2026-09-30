import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateExecution } from '../lib/execution/simulator.ts';
import {
  ASSUMED_RVOL,
  ASSUMED_SPREAD_BPS,
  executionQuoteAssumptions,
} from '../lib/execution/quote-assumptions.ts';

test('a delayed bar with no microstructure is charged the labeled assumption', () => {
  const assumptions = executionQuoteAssumptions({
    spread_bps: null,
    rvol: null,
    float_rotation: null,
  });
  assert.equal(assumptions.spreadBps, ASSUMED_SPREAD_BPS);
  assert.equal(assumptions.rvol, ASSUMED_RVOL);
  assert.equal(assumptions.floatRotation, 0);
  assert.equal(assumptions.spreadSource, 'assumed');
  assert.equal(assumptions.rvolSource, 'assumed');
  assert.equal(assumptions.floatRotationSource, 'assumed');
});

test('an observed tight spread stays tight', () => {
  const assumptions = executionQuoteAssumptions({
    spreadBps: 0,
    rvol: '1.25',
    floatRotation: 0.4,
  });
  assert.equal(assumptions.spreadBps, 0);
  assert.equal(assumptions.rvol, 1.25);
  assert.equal(assumptions.floatRotation, 0.4);
  assert.equal(assumptions.spreadSource, 'observed');
  assert.equal(assumptions.rvolSource, 'observed');
  assert.equal(assumptions.floatRotationSource, 'observed');
});

test('negative and non-finite spreads are not treated as free liquidity', () => {
  for (const spreadBps of [-100, Number.NaN, Number.POSITIVE_INFINITY, '']) {
    const assumptions = executionQuoteAssumptions({ spreadBps, rvol: 1, floatRotation: 0 });
    assert.equal(assumptions.spreadSource, 'assumed');
    assert.equal(assumptions.spreadBps, ASSUMED_SPREAD_BPS);
  }
});

test('missing microstructure costs more than a quoted 20 bps market', () => {
  const base = {
    notional: 10_000,
    price: 100,
    dollarVolume: 2_200_000,
    floatRotation: 0,
  };
  const quoted = simulateExecution({ ...base, spreadBps: 20, rvol: 1 });
  const missing = executionQuoteAssumptions({ spread_bps: null, rvol: null, float_rotation: null });
  const assumed = simulateExecution({
    ...base,
    spreadBps: missing.spreadBps,
    rvol: missing.rvol,
    floatRotation: missing.floatRotation,
  });
  assert.ok(assumed.estimatedOneWayCostBps > quoted.estimatedOneWayCostBps + 100);
  assert.equal(assumed.capacityExceeded, false);
});
