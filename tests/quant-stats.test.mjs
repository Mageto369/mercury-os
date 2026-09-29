import assert from 'node:assert/strict';
import test from 'node:test';
import { averageTrueRangePct, dailyVolatilityPct, pathExcursion, sessionRisk, tradePlan, volTargetShares } from '../lib/market/quant-stats.ts';
import { rankDailyConsiderations } from '../lib/market/daily-rank.ts';

test('volatility uses the last twenty returns and the size risks fifty dollars', () => {
  const closes = [];
  let price = 4;
  for (let index = 0; index < 21; index += 1) {
    closes.push(Number(price.toFixed(4)));
    price *= index % 2 === 0 ? 1.02 : 0.98;
  }
  const volatility = dailyVolatilityPct(closes);
  assert.ok(volatility > 1);
  const target = volTargetShares(4, 5);
  assert.equal(target.sharesPer10k, 250);
  assert.equal(target.notionalPer10k, 1000);
  assert.deepEqual(volTargetShares(4, 0), { sharesPer10k: null, notionalPer10k: null });
});

test('average true range needs a full fourteen-session window', () => {
  const bars = Array.from({ length: 15 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
    close: 10,
    high: 10.5,
    low: 9.5,
  }));
  assert.equal(averageTrueRangePct(bars), 10);
  assert.equal(averageTrueRangePct(bars.slice(0, 10)), null);
  const risk = sessionRisk(10, bars);
  assert.equal(risk.atrPct, 10);
  assert.equal(risk.riskBudgetUsd, 50);
  assert.equal(risk.capitalBaseUsd, 10000);
});

test('the forward path keeps the worst and best close', () => {
  assert.deepEqual(pathExcursion(10, [9, 8, 11, 12, 10]), { adversePct: -20, favorablePct: 20 });
  assert.deepEqual(tradePlan(3.74, -1.84, 3.05), { stop: 3.67, target: 3.85, rMultiple: 1.66 });
  assert.deepEqual(tradePlan(null, -1, 2), { stop: null, target: null, rMultiple: null });
});

test('win rate, expectancy, payoff, and path medians come from the same similar sessions', () => {
  const features = {
    return5Pct: 4,
    relativeVolume: 1.2,
    extension20Pct: 3,
    closeLocationPct: 70,
    room: false,
    riseScore: 62,
  };
  const gains = [4, 4, 4, 4, 10, 10, 10, -2];
  const adverse = [-1, -1, -1, -1, -3, -3, -3, -8];
  const favorable = [6, 6, 6, 6, 12, 12, 12, 1];
  const analogs = gains.map((gain, index) => ({
    symbol: `S${index}`,
    date: `2026-06-${String(index + 1).padStart(2, '0')}`,
    ...features,
    forward5Pct: gain,
    adversePct: adverse[index],
    favorablePct: favorable[index],
  }));
  const rank = rankDailyConsiderations([
    { symbol: 'MIX', asOf: '2026-09-28', blocksRoom: false, socialHype: null, setup: features },
  ], analogs);
  const pick = rank.picks[0];
  assert.equal(rank.model, 'mercury-analog-rank-v2');
  assert.equal(pick.winRatePct, 87.5);
  assert.equal(pick.expectancyPct, 5.5);
  assert.equal(pick.payoff, 3.29);
  assert.equal(pick.adversePct, -2);
  assert.equal(pick.favorablePct, 6);
});
