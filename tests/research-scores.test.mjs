import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveResearchOutlook, scoreLiquidity } from '../lib/workflows/research-scores.ts';

test('dollar volume ranks names when spread and relative volume are absent', () => {
  const large = scoreLiquidity(13_000_000_000, null, null, null);
  const mid = scoreLiquidity(2_200_000, null, null, null);
  const small = scoreLiquidity(100_000, null, null, null);
  assert.ok(large > mid);
  assert.ok(mid > small);
  assert.equal(large, 100);
  assert.equal(mid, 65);
});

test('a wide spread lowers a liquid name instead of being ignored', () => {
  const volumeOnly = scoreLiquidity(1_000_000_000, null, null, null);
  const wide = scoreLiquidity(1_000_000_000, 800, null, null);
  assert.ok(wide < volumeOnly);
  assert.equal(wide, 57);
});

test('volume breadth is selective when microstructure was not observed', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    dollarVolume: index < 7 ? 1_000_000 : 1_000,
    spreadBps: null,
    rvol: null,
    floatRotation: null,
  }));
  const outlook = deriveResearchOutlook(rows);
  assert.equal(outlook.basis, 'volume-breadth');
  assert.equal(outlook.breadthProxy, 70);
  assert.equal(outlook.outlookScore, 70);
  assert.equal(outlook.regime, 'SELECTIVE');
  assert.equal(outlook.medianRvol, null);
  assert.equal(outlook.medianSpreadBps, null);
});

test('observed relative volume and spread can reach risk-on', () => {
  const rows = Array.from({ length: 4 }, () => ({
    dollarVolume: 1_000_000,
    spreadBps: 50,
    rvol: 2,
    floatRotation: null,
  }));
  const outlook = deriveResearchOutlook(rows);
  assert.equal(outlook.basis, 'microstructure');
  assert.equal(outlook.regime, 'RISK_ON');
  assert.equal(outlook.outlookScore, 88);
});

test('an empty tape is defensive and does not invent a spread', () => {
  const outlook = deriveResearchOutlook([]);
  assert.equal(outlook.basis, 'none');
  assert.equal(outlook.regime, 'DEFENSIVE');
  assert.equal(outlook.outlookScore, 0);
  assert.equal(outlook.medianSpreadBps, null);
});
