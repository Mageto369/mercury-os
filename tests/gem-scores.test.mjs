import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionValidationSeed } from '../lib/db/validation-seed-plan.ts';
import { scoreGemCandidate } from '../lib/workflows/gem-scores.ts';

test('liquidity alone cannot mint a gem or a clean structure', () => {
  const scored = scoreGemCandidate({
    liquidityScore: 100,
    marketOutlook: 70,
    catalystScore: null,
    structureScore: null,
    attentionGapScore: null,
    promotionRisk: 0,
    hasRiskFlag: false,
  });
  assert.equal(scored.gemScore, 34);
  assert.ok(scored.gemScore < 75);
  assert.deepEqual(scored.reasons, ['strong tradable liquidity']);
});

test('an observed catalyst and a real structure warning stay in the score', () => {
  const scored = scoreGemCandidate({
    liquidityScore: 80,
    marketOutlook: 70,
    catalystScore: 80,
    structureScore: 40,
    attentionGapScore: 80,
    promotionRisk: 60,
    hasRiskFlag: true,
  });
  assert.equal(scored.gemScore, 70);
  assert.ok(scored.reasons.includes('recent regulatory catalyst support'));
  assert.ok(scored.reasons.includes('low-crowding attention gap'));
  assert.ok(scored.reasons.includes('structural warning present'));
  assert.ok(scored.reasons.includes('promotion pressure reduces quality'));
  assert.equal(scored.reasons.includes('clean structural-risk profile'), false);
});

test('a fully observed name can still clear the gem threshold', () => {
  const scored = scoreGemCandidate({
    liquidityScore: 100,
    marketOutlook: 80,
    catalystScore: 90,
    structureScore: 90,
    attentionGapScore: 90,
    promotionRisk: 0,
    hasRiskFlag: false,
  });
  assert.equal(scored.gemScore, 92);
  assert.ok(scored.reasons.includes('clean structural-risk profile'));
});

test('validation seeding refuses a symbol that already belongs to the live universe', () => {
  const plan = partitionValidationSeed([
    { id: 'sec:vrtx', symbol: 'VRTX' },
    { id: 'validation:IOND', symbol: 'IOND' },
  ], [
    { symbol: 'VRTX' },
    { symbol: 'IOND' },
    { symbol: 'DRNX' },
  ]);
  assert.deepEqual(plan.skipped, ['VRTX']);
  assert.deepEqual(plan.seed, ['IOND', 'DRNX']);
});
