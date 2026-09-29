import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNasdaqHistoricalBars, summarizePriceHistory } from '../lib/market/nasdaq-history.ts';

test('nasdaq historical text rows become oldest-first daily bars', () => {
  const bars = parseNasdaqHistoricalBars({
    data: {
      tradesTable: {
        rows: [
          { date: '09/28/2026', close: '$3.29', volume: '72,730,960', open: '$2.92', high: '$3.40', low: '$2.90' },
          { date: '09/25/2026', close: '$2.92', volume: '40,000,000', open: '$2.80', high: '$3.01', low: '$2.75' },
          { date: 'bad', close: '$1.00', open: '$1', high: '$1', low: '$1', volume: '1' },
        ],
      },
    },
  });
  assert.equal(bars.length, 2);
  assert.equal(bars[0].date, '2026-09-25');
  assert.equal(bars[1].close, 3.29);
  assert.equal(bars[1].volume, 72730960);
});

test('change uses the prior session when the latest bar matches the quoted price', () => {
  const history = summarizePriceHistory(3.29, [
    { date: '2026-09-25', close: 2.92, volume: 100 },
    { date: '2026-09-28', close: 3.29, volume: 200 },
  ]);
  assert.equal(history.previousClose, 2.92);
  assert.equal(history.changePct, 12.67);
  assert.deepEqual(history.closes, [2.92, 3.29]);
  assert.equal(history.high, 3.29);
  assert.equal(history.low, 2.92);
});

test('an empty history does not invent a change', () => {
  const history = summarizePriceHistory(3.29, []);
  assert.equal(history.previousClose, null);
  assert.equal(history.changePct, null);
  assert.deepEqual(history.closes, []);
});
