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

test('a better projected gain ranks above a louder stretched setup', () => {
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
  assert.deepEqual(rank.picks.map((pick) => pick.symbol), ['FOLLOW', 'ROOM', 'LOUD']);
  assert.equal(rank.picks[0].projectedGainPct, 3);
  assert.equal(rank.picks[0].rank, 1);
  assert.equal(rank.picks[1].room, true);
  assert.equal(rank.picks[1].projectedGainPct, -1);
  assert.ok(rank.picks[0].projectedGainPct > rank.picks[2].projectedGainPct);
  assert.equal(rank.picks.some((pick) => pick.symbol === 'WEAK' || pick.symbol === 'OFFER'), false);
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
