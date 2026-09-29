import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNasdaqHistoricalBars, scoreRiseRoom, summarizePriceHistory } from '../lib/market/nasdaq-history.ts';

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
  assert.equal(history.return5Pct, null);
  assert.equal(history.relativeVolume, null);
  assert.equal(history.rangePositionPct, 100);
  assert.equal(history.extension20Pct, null);
  assert.equal(history.closeLocationPct, null);
  assert.equal(history.rise.score, null);
  assert.equal(history.rise.room, false);
});

test('extension uses twenty closes and the close location uses that session high and low', () => {
  const bars = Array.from({ length: 19 }, (_, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, '0')}`,
    close: 2,
    volume: 100,
    high: 2.1,
    low: 1.9,
  }));
  bars.push({ date: '2026-09-01', close: 2.2, volume: 100, high: 2.4, low: 1.8 });
  const history = summarizePriceHistory(2.2, bars);
  assert.equal(history.extension20Pct, 9.45);
  assert.equal(history.closeLocationPct, 67);
  const early = summarizePriceHistory(2.3, bars.slice(0, 19));
  assert.equal(early.extension20Pct, null);
  const ahead = summarizePriceHistory(2.3, bars);
  assert.equal(ahead.closeLocationPct, null);
  assert.equal(ahead.extension20Pct, 14.43);
});

test('five-session return, relative volume, and range use the stored bars', () => {
  const closes = [2, 2.1, 2.2, 2.3, 2.4, 2.5, 3];
  const history = summarizePriceHistory(3, closes.map((close, index) => ({
    date: `2026-09-${String(index + 10).padStart(2, '0')}`,
    close,
    volume: index === closes.length - 1 ? 200 : 100,
  })));
  assert.equal(history.return5Pct, 42.86);
  assert.equal(history.relativeVolume, 2);
  assert.equal(history.rangePositionPct, 100);
});

test('a quote ahead of the last bar does not borrow that bar as today volume', () => {
  const history = summarizePriceHistory(3.1, [
    { date: '2026-09-18', close: 2, volume: 100 },
    { date: '2026-09-21', close: 2.1, volume: 100 },
    { date: '2026-09-22', close: 2.2, volume: 100 },
    { date: '2026-09-23', close: 2.3, volume: 100 },
    { date: '2026-09-24', close: 2.4, volume: 100 },
    { date: '2026-09-25', close: 2.5, volume: 100 },
    { date: '2026-09-28', close: 3, volume: 200 },
  ]);
  assert.equal(history.relativeVolume, null);
  assert.equal(history.return5Pct, 40.91);
  assert.equal(history.changePct, 3.33);
});

test('a rise still near the 20-session average outranks a stretched gain', () => {
  const room = scoreRiseRoom({ return5Pct: 4.06, relativeVolume: 1.25, extension20Pct: 2.15, closeLocationPct: 91 });
  const stretched = scoreRiseRoom({ return5Pct: 13.84, relativeVolume: 2.69, extension20Pct: 22.12, closeLocationPct: 78 });
  const below = scoreRiseRoom({ return5Pct: -8.83, relativeVolume: 0.77, extension20Pct: -8.81, closeLocationPct: 5 });
  const missing = scoreRiseRoom({ return5Pct: 4, relativeVolume: 1.4, extension20Pct: null, closeLocationPct: 80 });
  assert.equal(room.room, true);
  assert.equal(room.score, 78);
  assert.equal(stretched.room, false);
  assert.equal(stretched.score, 71);
  assert.equal(below.room, false);
  assert.equal(below.score, 10);
  assert.ok(room.score > stretched.score);
  assert.ok(stretched.score > below.score);
  assert.deepEqual(missing, { score: null, room: false });
});

test('an empty history does not invent a change', () => {
  const history = summarizePriceHistory(3.29, []);
  assert.equal(history.previousClose, null);
  assert.equal(history.changePct, null);
  assert.equal(history.return5Pct, null);
  assert.equal(history.relativeVolume, null);
  assert.equal(history.rangePositionPct, null);
  assert.equal(history.extension20Pct, null);
  assert.equal(history.closeLocationPct, null);
  assert.equal(history.rise.score, null);
  assert.equal(history.rise.room, false);
  assert.deepEqual(history.closes, []);
});
