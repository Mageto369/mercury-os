import assert from 'node:assert/strict';
import test from 'node:test';
import { pathMarks } from '../lib/market/nasdaq-history.ts';
import { labelForwardSession } from '../lib/market/research-label.ts';
import { buildResearchDecision, researchGatePass } from '../lib/market/research-journal.ts';
import { isDailyTen, scoreResearchBook } from '../lib/market/research-scorecard.ts';
import { SEED_RULE_CARD, cardHash, cardWithinBounds } from '../lib/market/rule-card.ts';

const card = { version: 'v3-constants', hash: 'abc', expectancyFloorPct: 0 };

function candidate(overrides = {}) {
  return {
    symbol: 'anvs',
    sessionDate: '2026-09-28',
    evidenceClass: 'delayed-reference',
    price: 1.38,
    return5Pct: 4,
    relativeVolume: 1.2,
    extension20Pct: 3,
    closeLocationPct: 70,
    riseScore: 62,
    room: true,
    blocksRoom: false,
    socialHype: null,
    catalystScore: null,
    shadowAction: 'WATCH',
    regime: 'SELECTIVE',
    ...overrides,
  };
}

function projection(overrides = {}) {
  return {
    rank: 1,
    eligible: true,
    expectancyPct: 2.67,
    projectedGainPct: 0.18,
    projectedLowPct: -6.2,
    projectedHighPct: 9.47,
    edge: 0.89,
    winRatePct: 50,
    payoff: 1.76,
    adversePct: -2.99,
    favorablePct: 3.13,
    targetFirstPct: 54.17,
    analogs: 24,
    ...overrides,
  };
}

test('the seeded rule card is the current rank and stays inside the search bounds', () => {
  assert.equal(SEED_RULE_CARD.version, 'v3-constants');
  assert.equal(SEED_RULE_CARD.model, 'mercury-analog-rank-v3');
  assert.equal(SEED_RULE_CARD.analogDistanceCap, 1.35);
  assert.equal(SEED_RULE_CARD.minAnalogs, 8);
  assert.equal(SEED_RULE_CARD.strengthFloor, 50);
  assert.equal(SEED_RULE_CARD.expectancyFloorPct, 0);
  assert.equal(SEED_RULE_CARD.edgeFloor, null);
  assert.equal(SEED_RULE_CARD.roomExtensionCapPct, 15);
  assert.equal(SEED_RULE_CARD.riseWeightRoom + SEED_RULE_CARD.riseWeightHold + SEED_RULE_CARD.riseWeightTrend + SEED_RULE_CARD.riseWeightVolume, 100);
  assert.equal(SEED_RULE_CARD.capitalExecutionEnabled, false);
  assert.equal(cardWithinBounds(SEED_RULE_CARD), true);
  assert.equal(cardHash(SEED_RULE_CARD), cardHash({ ...SEED_RULE_CARD }));
  assert.notEqual(cardHash(SEED_RULE_CARD), cardHash({ ...SEED_RULE_CARD, minAnalogs: 12 }));
  assert.equal(cardWithinBounds({ ...SEED_RULE_CARD, capitalExecutionEnabled: true }), false);
  assert.equal(cardWithinBounds({ ...SEED_RULE_CARD, roomExtensionCapPct: 22 }), false);
});

test('a journal row passes the buy gate only with room and a positive expectancy', () => {
  const open = buildResearchDecision(candidate(), projection(), card);
  assert.equal(open.id, 'decision:2026-09-28:ANVS:v3-constants');
  assert.equal(open.gatePass, true);
  assert.equal(open.evidenceClass, 'delayed-reference');
  assert.equal(buildResearchDecision(candidate({ room: false }), projection({ expectancyPct: 2 }), card).gatePass, false);
  assert.equal(buildResearchDecision(candidate({ blocksRoom: true }), projection(), card).gatePass, false);
  assert.equal(buildResearchDecision(candidate(), projection({ expectancyPct: 0 }), card).gatePass, false);
  assert.equal(buildResearchDecision(candidate(), projection({ expectancyPct: null, eligible: false, rank: 4 }), card).rank, null);
  assert.equal(buildResearchDecision(candidate({ sessionDate: '09/28/2026' }), projection(), card), null);
  assert.equal(researchGatePass({ room: true, blocksRoom: false, expectancyPct: 0.01, floorPct: 0 }), true);
});

test('a label uses five later closes and ignores the path before the session', () => {
  const bars = Array.from({ length: 16 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    close: index === 9 ? 10 : index === 10 ? 11 : index === 11 ? 12 : index === 12 ? 13 : index === 13 ? 9 : 10,
  }));
  const early = labelForwardSession(bars, '2026-01-10');
  const future = [11, 12, 13, 9, 10];
  const marks = pathMarks(10, future);
  assert.equal(early.forward5Pct, 0);
  assert.equal(early.adversePct, marks.adversePct);
  assert.equal(early.favorablePct, marks.favorablePct);
  assert.equal(early.targetFirst, marks.targetFirst);
  assert.equal(early.targetFirst, true);
  assert.deepEqual(early.barDates, ['2026-01-10', '2026-01-11', '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15']);
  assert.equal(early.evidenceClass, 'delayed-reference');
  assert.equal(labelForwardSession(bars, '2026-01-14'), null);
  assert.equal(labelForwardSession(bars, '2026-02-01'), null);
  const flat = bars.map((bar) => ({ ...bar, close: 10 }));
  assert.equal(labelForwardSession(flat, '2026-01-10').adversePct, 0);
  assert.equal(labelForwardSession(flat, '2026-01-10').targetFirst, null);
});

test('the scorecard compares the daily ten with the rest and does not promote', () => {
  const ten = Array.from({ length: 20 }, (_, index) => ({
    sessionDate: `2026-08-${String((index % 20) + 1).padStart(2, '0')}`,
    eligible: true,
    rank: 1,
    expectancyPct: 1,
    room: false,
    blocksRoom: false,
    gatePass: false,
    forward5Pct: 2,
    realizedAdversePct: -1,
  }));
  const rest = Array.from({ length: 20 }, (_, index) => ({
    sessionDate: `2026-08-${String((index % 20) + 1).padStart(2, '0')}`,
    eligible: true,
    rank: null,
    expectancyPct: null,
    room: true,
    blocksRoom: false,
    gatePass: false,
    forward5Pct: 0,
    realizedAdversePct: -3,
  }));
  const score = scoreResearchBook([...ten, ...rest]);
  assert.equal(score.status, 'recorded');
  assert.equal(score.tenSlots, 20);
  assert.equal(score.selectionPct, 2);
  assert.equal(score.tenHitPct, 100);
  assert.equal(score.restHitPct, 0);
  assert.equal(score.calibrationPct, -1);
  assert.equal(score.tenAdversePct, -1);
  assert.equal(score.gateRefusedRoom, 20);
  assert.equal(score.promoted, false);
  assert.equal(score.capitalExecutionEnabled, false);
  assert.equal(score.evidenceClass, 'delayed-reference');
  const thin = scoreResearchBook(ten.slice(0, 19).concat(rest));
  assert.equal(thin.status, 'insufficient');
  assert.equal(thin.tenSlots, 19);
  assert.equal(isDailyTen({ eligible: true, rank: 11 }), false);
  assert.equal(scoreResearchBook([]).status, 'insufficient');
});
