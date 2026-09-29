import assert from 'node:assert/strict';
import test from 'node:test';
import { screenPaperBuy, screenPennyStock } from '../lib/workflows/penny-screen.ts';

test('a liquid common stock under $5 passes the penny screen', () => {
  const result = screenPennyStock({ symbol: 'akba', price: 0.89, dollarVolume: 3_000_000, spreadBps: null });
  assert.equal(result.pass, true);
  assert.deepEqual(result.reasons, []);
});

test('prices at or above $5 are not penny stocks', () => {
  const atFive = screenPennyStock({ symbol: 'A', price: 5, dollarVolume: 1_000_000 });
  const above = screenPennyStock({ symbol: 'AON', price: 272.1, dollarVolume: 50_000_000 });
  assert.equal(atFive.pass, false);
  assert.equal(above.pass, false);
  assert.match(above.reasons.join(' '), /under \$5/);
});

test('missing price, thin volume, a wide spread, and a warrant all fail', () => {
  assert.equal(screenPennyStock({ symbol: 'ABUS', price: null, dollarVolume: 1_000_000 }).pass, false);
  assert.equal(screenPennyStock({ symbol: 'ABUS', price: 1.2, dollarVolume: 10_000 }).pass, false);
  assert.equal(screenPennyStock({ symbol: 'ABUS', price: 1.2, dollarVolume: 200_000, spreadBps: 900 }).pass, false);
  assert.equal(screenPennyStock({ symbol: 'ABCD.WS', price: 1.2, dollarVolume: 200_000 }).pass, false);
  assert.equal(screenPennyStock({ symbol: 'ABCWW', price: 1.2, dollarVolume: 200_000 }).pass, false);
});

test('a price-only auto-buy check still rejects a large cap', () => {
  assert.equal(screenPennyStock({ symbol: 'AA', price: 42.25 }).pass, false);
  assert.equal(screenPennyStock({ symbol: 'ALT', price: 2.96 }).pass, true);
});

test('a new simulated buy requires room and a positive expectancy', () => {
  assert.equal(screenPaperBuy({ symbol: 'AFCG', price: 3.59, room: true, expectancyPct: 0.63 }).pass, true);
  assert.deepEqual(screenPaperBuy({ symbol: 'AMC', price: 3.29, room: false, expectancyPct: 2 }).reasons, ['rise is not marked room']);
  assert.deepEqual(screenPaperBuy({ symbol: 'AFCG', price: 3.59, room: true, expectancyPct: -0.4 }).reasons, ['expectancy is not positive']);
  assert.deepEqual(screenPaperBuy({ symbol: 'AFCG', price: 3.59, room: true, expectancyPct: null }).reasons, ['expectancy is not positive']);
  assert.equal(screenPaperBuy({ symbol: 'AA', price: 42.25, room: true, expectancyPct: 1 }).pass, false);
  assert.equal(screenPaperBuy({ symbol: 'AFCG', price: null, room: true, expectancyPct: 1 }).pass, false);
});
