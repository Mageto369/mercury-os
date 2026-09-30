import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPricePush, displaySocialScore, observedCatalystScore, scorePricePush, socialHypeScore } from '../lib/market/price-push.ts';
import { parseStocktwitsStream } from '../lib/market/stocktwits.ts';

const asOf = '2026-09-29';

test('a recent 8-K is news and a dilution filing blocks room', () => {
  const news = scorePricePush([{ form: '8-K', filedOn: '2026-09-20' }], null, asOf);
  assert.equal(news.newsForm, '8-K');
  assert.equal(news.newsLabel, 'material corporate event');
  assert.equal(news.blocksRoom, false);
  assert.equal(news.adjustment, 12);
  const dilution = scorePricePush([
    { form: '8-K', filedOn: '2026-09-20' },
    { form: '424B5', filedOn: '2026-09-22' },
  ], null, asOf);
  assert.equal(dilution.blocksRoom, true);
  assert.equal(dilution.newsForm, '424B5');
  assert.equal(dilution.adjustment, -20);
});

test('a Stocktwits page counts bullish and bearish tags and an empty page is quiet', () => {
  const snapshot = parseStocktwitsStream({
    symbol: { watchlist_count: 593 },
    messages: [
      { entities: { sentiment: { basic: 'Bullish' } } },
      { entities: { sentiment: { basic: 'Bearish' } } },
      { entities: {} },
    ],
  });
  assert.deepEqual(snapshot, { mentions: 3, bullish: 1, bearish: 1, watchers: 593 });
  assert.deepEqual(parseStocktwitsStream({ messages: [] }), { mentions: 0, bullish: 0, bearish: 0, watchers: 0 });
  assert.equal(parseStocktwitsStream({}), null);
});

test('an 8-K becomes a catalyst score and a missing filing stays blank', () => {
  const filing = scorePricePush([{ form: '8-K', filedOn: '2026-09-20' }], null, asOf);
  assert.equal(observedCatalystScore(filing), 70);
  assert.equal(observedCatalystScore(scorePricePush([{ form: 'S-1', filedOn: '2026-09-20' }], null, asOf)), null);
  assert.equal(observedCatalystScore(scorePricePush([], null, asOf)), null);
  const missing = scorePricePush([], null, asOf);
  assert.equal(displaySocialScore(missing, 8), 8);
  assert.equal(displaySocialScore({ ...missing, socialUnavailable: true }, 8), null);
  assert.equal(displaySocialScore({ ...missing, socialHype: 73, socialUnavailable: true }, 8), 73);
});

test('a filing outside two weeks and a missing social feed add nothing', () => {
  const push = scorePricePush([{ form: '8-K', filedOn: '2026-08-01' }], null, asOf);
  assert.equal(push.newsForm, null);
  assert.equal(push.socialHype, null);
  assert.equal(push.adjustment, null);
  assert.equal(push.blocksRoom, false);
});

test('elevated Stocktwits attention lifts the rise score and dilution removes room', () => {
  const hype = socialHypeScore({ mentions: 30, bullish: 20, bearish: 2, watchers: 80_000 });
  assert.ok(hype >= 70);
  const push = scorePricePush([], { mentions: 30, bullish: 20, bearish: 2, watchers: 80_000 }, asOf);
  const raised = applyPricePush({ score: 78, room: true }, push);
  assert.ok(raised.score > 78);
  assert.equal(raised.room, true);
  const blocked = applyPricePush({ score: 78, room: true }, scorePricePush([{ form: 'S-3', filedOn: '2026-09-25' }], null, asOf));
  assert.equal(blocked.room, false);
  assert.ok(blocked.score < 78);
  const unchanged = applyPricePush({ score: 78, room: true }, scorePricePush([], null, asOf));
  assert.deepEqual(unchanged, { score: 78, room: true });
});
