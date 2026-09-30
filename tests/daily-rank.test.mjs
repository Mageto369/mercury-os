import assert from 'node:assert/strict';
import test from 'node:test';
import { rankDailyConsiderations } from '../lib/market/daily-rank.ts';

function setup(overrides) {
  return {
    return5Pct: 4,
    relativeVolume: 1.2,
    extension20Pct: 3,
    closeLocationPct: 70,
    room: false,
    riseScore: 62,
    ...overrides,
  };
}

function analog(symbol, forward, features, date = '2026-06-01') {
  return { symbol, date: `${date}:${symbol}`, ...features, forward5Pct: forward };
}

function cluster(prefix, count, forward, features) {
  return Array.from({ length: count }, (_, index) => analog(`${prefix}${index}`, forward, features, `2026-06-${String(index + 1).padStart(2, '0')}`));
}

const followThrough = setup({ return5Pct: 2, riseScore: 62 });
const roomName = setup({ return5Pct: 22, extension20Pct: 4, closeLocationPct: 88, room: true, riseScore: 78 });
const stretched = setup({ return5Pct: 40, relativeVolume: 2.4, extension20Pct: 24, closeLocationPct: 80, riseScore: 90 });

test('a positive average stays on the list and a losing average does not', () => {
  const rank = rankDailyConsiderations([
    { symbol: 'FOLLOW', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: followThrough },
    { symbol: 'ROOM', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: roomName },
    { symbol: 'LOUD', asOf: '2026-09-28', blocksRoom: false, socialHype: 100, setup: stretched },
    { symbol: 'WEAK', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: setup({ return5Pct: 30, riseScore: 20 }) },
    { symbol: 'OFFER', asOf: '2026-09-28', blocksRoom: true, socialHype: null, setup: followThrough },
  ], [
    ...cluster('F', 8, 3, followThrough),
    ...cluster('R', 8, -1, roomName),
    ...cluster('L', 8, -4, stretched),
    ...cluster('W', 8, 10, setup({ return5Pct: 30, riseScore: 20 })),
  ]);
  assert.deepEqual(rank.picks.map((pick) => pick.symbol), ['FOLLOW']);
  assert.equal(rank.picks[0].projectedGainPct, 3);
  assert.equal(rank.picks[0].winRatePct, 100);
  assert.equal(rank.picks[0].expectancyPct, 3);
  assert.equal(rank.picks[0].payoff, null);
  assert.equal(rank.picks[0].edge, null);
  assert.equal(rank.picks[0].rank, 1);
  const room = rank.considered.find((row) => row.symbol === 'ROOM');
  assert.equal(room.room, true);
  assert.equal(room.expectancyPct, -1);
  assert.equal(room.eligible, false);
  assert.equal(rank.considered.find((row) => row.symbol === 'LOUD').eligible, false);
  assert.equal(rank.picks.some((pick) => pick.symbol === 'WEAK' || pick.symbol === 'OFFER' || pick.symbol === 'ROOM'), false);
  assert.equal(rank.considered.find((row) => row.symbol === 'OFFER').eligible, false);
});

test('one symbol cannot pull the median and a thin history stays off the list', () => {
  const features = followThrough;
  const dominant = Array.from({ length: 10 }, (_, index) => analog('SAME', 20, features, `2026-05-${String(index + 1).padStart(2, '0')}`));
  const peers = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((symbol) => analog(symbol, 4, features));
  const rank = rankDailyConsiderations([
    { symbol: 'BALANCED', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: features },
    { symbol: 'THIN', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: setup({ return5Pct: 30, riseScore: 70 }) },
  ], [...dominant, ...peers, ...cluster('T', 7, 5, setup({ return5Pct: 30, riseScore: 70 }))]);
  assert.equal(rank.picks.map((pick) => pick.symbol).join(','), 'BALANCED');
  assert.equal(rank.picks[0].projectedGainPct, 4);
  assert.ok(rank.picks[0].analogs <= 11);
  const thin = rank.considered.find((row) => row.symbol === 'THIN');
  assert.equal(thin.projectedGainPct, null);
  assert.equal(thin.eligible, false);
});

test('the daily list stops at ten and keeps the highest projected gain first', () => {
  const features = followThrough;
  const many = Array.from({ length: 12 }, (_, index) => ({
    symbol: `N${String(index).padStart(2, '0')}`,
    asOf: '2026-09-28',
    blocksRoom: false,
    socialHype: null,
    setup: { ...features, riseScore: 55 },
  }));
  const analogs = cluster('P', 8, 1, features).map((row, index) => ({ ...row, forward5Pct: index }));
  const rank = rankDailyConsiderations(many, analogs);
  assert.equal(rank.picks.length, 10);
  assert.equal(rank.picks[0].rank, 1);
  assert.equal(rank.picks[9].rank, 10);
  assert.ok(rank.picks[0].projectedGainPct >= rank.picks[9].projectedGainPct);
});

test('expectancy outranks a higher median', () => {
  const fatTail = setup({ return5Pct: 2, riseScore: 70 });
  const steady = setup({ return5Pct: 28, riseScore: 60 });
  const rank = rankDailyConsiderations([
    { symbol: 'TAIL', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: fatTail },
    { symbol: 'STEADY', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: steady },
  ], [
    ...[12, 12, 12, 12, -2, -2, -2, -40].map((gain, index) => analog(`T${index}`, gain, fatTail, `2026-04-${String(index + 1).padStart(2, '0')}`)),
    ...cluster('S', 8, 2, steady),
  ]);
  assert.deepEqual(rank.picks.map((pick) => pick.symbol), ['STEADY', 'TAIL']);
  assert.equal(rank.picks[0].expectancyPct, 2);
  assert.equal(rank.picks[1].projectedGainPct, 5);
  assert.ok(rank.picks[1].projectedGainPct > rank.picks[0].projectedGainPct);
});

test('a losing average stays off the list and a tighter adverse path wins an expectancy tie', () => {
  const tight = setup({ return5Pct: 2, riseScore: 62 });
  const wide = setup({ return5Pct: 18, riseScore: 62 });
  const flat = setup({ return5Pct: 40, riseScore: 62 });
  const rank = rankDailyConsiderations([
    { symbol: 'WIDE', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: wide },
    { symbol: 'TIGHT', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: tight },
    { symbol: 'FLAT', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: flat },
  ], [
    ...Array.from({ length: 8 }, (_, index) => ({ ...analog(`T${index}`, 2, tight, `2026-03-${String(index + 1).padStart(2, '0')}`), adversePct: -1, favorablePct: 3 })),
    ...Array.from({ length: 8 }, (_, index) => ({ ...analog(`W${index}`, 2, wide, `2026-02-${String(index + 1).padStart(2, '0')}`), adversePct: -4, favorablePct: 3 })),
    ...cluster('Z', 8, 0, flat),
  ]);
  assert.equal(rank.model, 'mercury-analog-rank-v3');
  assert.deepEqual(rank.picks.map((pick) => pick.symbol), ['TIGHT', 'WIDE']);
  assert.equal(rank.picks[0].expectancyPct, 2);
  assert.equal(rank.picks[0].edge, 2);
  assert.equal(rank.picks[1].edge, 0.5);
  const loser = rank.considered.find((row) => row.symbol === 'FLAT');
  assert.equal(loser.expectancyPct, 0);
  assert.equal(loser.eligible, false);
  assert.equal(loser.edge, null);
});

test('the seeded knobs match the default rank and a higher expectancy floor drops the thinner name', () => {
  const modest = setup({ return5Pct: 4, riseScore: 62 });
  const strong = setup({ return5Pct: 30, riseScore: 62 });
  const candidates = [
    { symbol: 'MODEST', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: modest },
    { symbol: 'STRONG', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: strong },
  ];
  const analogs = [
    ...Array.from({ length: 8 }, (_, index) => analog(`M${index}`, 0.5, modest, `2026-03-${String(index + 1).padStart(2, '0')}`)),
    ...cluster('H', 8, 2, strong),
  ];
  const implicit = rankDailyConsiderations(candidates, analogs);
  const seeded = rankDailyConsiderations(candidates, analogs, 10, {
    minAnalogs: 8,
    distanceCap: 1.35,
    strengthFloor: 50,
    expectancyFloorPct: 0,
    edgeFloor: null,
  });
  assert.deepEqual(seeded.picks.map((pick) => [pick.symbol, pick.expectancyPct, pick.rank]), implicit.picks.map((pick) => [pick.symbol, pick.expectancyPct, pick.rank]));
  const raised = rankDailyConsiderations(candidates, analogs, 10, { expectancyFloorPct: 1 });
  assert.deepEqual(raised.picks.map((pick) => pick.symbol), ['STRONG']);
  assert.equal(raised.considered.find((row) => row.symbol === 'MODEST').eligible, false);
  assert.equal(rankDailyConsiderations(candidates, analogs, 10, { minAnalogs: 12 }).picks.length, 0);
});
