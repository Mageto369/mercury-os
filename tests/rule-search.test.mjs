import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseChallenger, neighbors, nextKnob, shadowAdoption, splitSessions } from '../lib/market/rule-search.ts';

const seed = {
  version: 'v3-constants',
  roomRelativeVolumeFloor: 1,
  roomExtensionCapPct: 15,
  roomCloseLocationFloor: 60,
  riseWeightRoom: 40,
  riseWeightHold: 25,
  riseWeightTrend: 20,
  riseWeightVolume: 15,
  analogDistanceCap: 1.35,
  minAnalogs: 8,
  expectancyFloorPct: 0,
  edgeFloor: null,
  strengthFloor: 50,
};

function dates(count, start = 1) {
  return Array.from({ length: count }, (_, index) => {
    const day = String(start + index).padStart(2, '0');
    return `2026-01-${day}`;
  });
}

function grade(overrides = {}) {
  return { tenSlots: 20, selectionPct: 1, tenAdversePct: -2, calibrationPct: 0, ...overrides };
}

test('holdout is the latest 20 sessions and does not overlap train', () => {
  const window = splitSessions([...dates(25), dates(25)[0]]);
  assert.equal(window.ready, true);
  assert.equal(window.holdout.length, 20);
  assert.equal(window.train.length, 5);
  assert.equal(window.holdout[0], '2026-01-06');
  assert.equal(window.train.at(-1), '2026-01-05');
  assert.equal(window.train.some((date) => window.holdout.includes(date)), false);
  assert.equal(splitSessions(dates(20)).ready, false);
  assert.deepEqual(splitSessions(dates(20)).holdout, []);
});

test('a seed card steps one grid point, and an off-grid extension does not jump to 22', () => {
  assert.deepEqual(neighbors(seed, 'relativeVolume').map((card) => card.roomRelativeVolumeFloor), [1.2]);
  assert.deepEqual(neighbors(seed, 'extension').map((card) => card.roomExtensionCapPct), [14, 16]);
  assert.equal(neighbors(seed, 'extension').some((card) => card.roomExtensionCapPct === 22), false);
  assert.deepEqual(neighbors(seed, 'closeLocation').map((card) => card.roomCloseLocationFloor), [55, 65]);
  assert.deepEqual(neighbors(seed, 'distance').map((card) => card.analogDistanceCap), [1.2, 1.5]);
  assert.deepEqual(neighbors(seed, 'minAnalogs').map((card) => card.minAnalogs), [12]);
  assert.deepEqual(neighbors(seed, 'expectancyFloor').map((card) => card.expectancyFloorPct), [0.25]);
  assert.deepEqual(neighbors(seed, 'edgeFloor').map((card) => card.edgeFloor), [0.25]);
  assert.deepEqual(neighbors(seed, 'strengthFloor').map((card) => card.strengthFloor), [40, 60]);
  const weightCards = neighbors(seed, 'weights');
  assert.equal(weightCards.length, 12);
  for (const card of weightCards) {
    assert.equal(card.riseWeightRoom + card.riseWeightHold + card.riseWeightTrend + card.riseWeightVolume, 100);
  }
  assert.equal(nextKnob('strengthFloor'), 'relativeVolume');
  assert.equal(nextKnob('relativeVolume'), 'extension');
});

test('a thin sample does not score and does not advance the knob', () => {
  const result = chooseChallenger({
    champion: seed,
    knob: 'relativeVolume',
    sessionDates: dates(20),
    accept: () => true,
    score: () => {
      throw new Error('score should not run');
    },
  });
  assert.equal(result.status, 'insufficient');
  assert.equal(result.reason, 'need_labeled_sessions');
  assert.equal(result.nextKnob, 'relativeVolume');
  assert.equal(result.card, null);
  assert.equal(result.promoted, false);
  assert.equal(shadowAdoption(result).adopt, false);
});

test('no legal step advances the knob without scoring', () => {
  const result = chooseChallenger({
    champion: seed,
    knob: 'distance',
    sessionDates: dates(25),
    accept: () => false,
    score: () => {
      throw new Error('score should not run');
    },
  });
  assert.equal(result.status, 'insufficient');
  assert.equal(result.reason, 'no_legal_step');
  assert.equal(result.nextKnob, 'minAnalogs');
  assert.equal(result.promoted, false);
});

test('holdout stays unread until train picks a step, and a holdout loss stays rejected', () => {
  const calls = [];
  const result = chooseChallenger({
    champion: seed,
    knob: 'relativeVolume',
    sessionDates: dates(25),
    accept: () => true,
    score: (card, windowDates) => {
      calls.push({ floor: card.roomRelativeVolumeFloor, count: windowDates.length });
      const holdout = windowDates.length === 20;
      if (!holdout) return grade({ selectionPct: card.roomRelativeVolumeFloor === 1 ? 1 : 2 });
      return grade({ selectionPct: card.roomRelativeVolumeFloor === 1 ? 2 : 1 });
    },
  });
  assert.deepEqual(calls.map((call) => call.count), [5, 5, 20, 20]);
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'holdout_selection');
  assert.equal(result.card.roomRelativeVolumeFloor, 1.2);
  assert.equal(result.nextKnob, 'extension');
  assert.equal(result.promoted, false);
  assert.equal(result.capitalExecutionEnabled, false);
  const adoption = shadowAdoption(result);
  assert.equal(adoption.adopt, false);
  assert.equal(adoption.role, 'challenger');
  assert.equal(adoption.retirePrevious, false);
  assert.equal(adoption.promotedToCapital, false);
});

test('a holdout win replaces the shadow champion and does not unlock capital', () => {
  const result = chooseChallenger({
    champion: seed,
    knob: 'relativeVolume',
    sessionDates: dates(25),
    accept: () => true,
    score: (card, windowDates) => {
      const holdout = windowDates.length === 20;
      if (!holdout) return grade({ selectionPct: card.roomRelativeVolumeFloor === 1 ? 1 : 0.5, tenAdversePct: -2 });
      return grade({ selectionPct: card.roomRelativeVolumeFloor === 1 ? 1 : 3, tenAdversePct: -2.4, calibrationPct: 0.4 });
    },
  });
  assert.equal(result.train.challenger.selectionPct, 0.5);
  assert.equal(result.status, 'candidate');
  assert.equal(result.reason, 'candidate');
  assert.equal(result.promoted, false);
  assert.equal(result.card.edgeFloor, null);
  const adoption = shadowAdoption(result);
  assert.equal(adoption.adopt, true);
  assert.equal(adoption.role, 'champion');
  assert.equal(adoption.status, 'shadow');
  assert.equal(adoption.retirePrevious, true);
  assert.equal(adoption.capitalExecutionEnabled, false);
  assert.equal(adoption.brokerAuthority, false);
  assert.equal(adoption.promotedToCapital, false);
});

test('nineteen holdout slots, a worse path, and worse calibration reject the step', () => {
  const coverage = chooseChallenger({
    champion: seed,
    knob: 'minAnalogs',
    sessionDates: dates(25),
    accept: () => true,
    score: (card, windowDates) => grade({
      tenSlots: windowDates.length === 20 && card.minAnalogs === 12 ? 19 : 20,
      selectionPct: card.minAnalogs === 12 ? 4 : 1,
    }),
  });
  assert.equal(coverage.status, 'rejected');
  assert.equal(coverage.reason, 'holdout_coverage');
  assert.equal(coverage.promoted, false);

  const path = chooseChallenger({
    champion: seed,
    knob: 'minAnalogs',
    sessionDates: dates(25),
    accept: () => true,
    score: (card, windowDates) => grade({
      selectionPct: card.minAnalogs === 12 ? 4 : 1,
      tenAdversePct: windowDates.length === 20 && card.minAnalogs === 12 ? -3 : -2,
    }),
  });
  assert.equal(path.reason, 'holdout_path');

  const calibration = chooseChallenger({
    champion: seed,
    knob: 'minAnalogs',
    sessionDates: dates(25),
    accept: () => true,
    score: (card, windowDates) => grade({
      selectionPct: card.minAnalogs === 12 ? 4 : 1,
      calibrationPct: windowDates.length === 20 && card.minAnalogs === 12 ? 2 : 0,
    }),
  });
  assert.equal(calibration.reason, 'holdout_calibration');
});

test('a train book that misses the slot floor advances the knob and never reads the holdout', () => {
  const calls = [];
  const result = chooseChallenger({
    champion: seed,
    knob: 'strengthFloor',
    sessionDates: dates(25),
    accept: () => true,
    score: (card, windowDates) => {
      calls.push(windowDates.length);
      return grade({ tenSlots: card.strengthFloor === 50 ? 20 : 19, tenAdversePct: -2 });
    },
  });
  assert.deepEqual(calls, [5, 5, 5]);
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'train_coverage');
  assert.equal(result.card, null);
  assert.equal(result.nextKnob, 'relativeVolume');
  assert.equal(result.promoted, false);
});
