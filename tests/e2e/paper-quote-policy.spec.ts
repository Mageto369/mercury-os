import { expect, test } from '@playwright/test';
import { selectPaperQuote } from '../../lib/paper/quote-policy';

const now = new Date('2026-09-06T12:00:00.000Z');
const quote = (minutesAgo:number, payload:Record<string,unknown>, source='test-feed') => ({
  price: 10,
  bid: 9.99,
  ask: 10.01,
  observed_at: new Date(now.getTime()-minutesAgo*60_000),
  source,
  payload,
});

test('auto prefers a valid live quote over a newer delayed quote', () => {
  const result=selectPaperQuote([
    quote(1,{evidenceClass:'delayed',livePull:false},'nasdaq-delayed'),
    quote(2,{evidenceClass:'live',livePull:true},'licensed-live'),
  ],'auto',now);
  expect(result.decision).toMatchObject({accepted:true,pricingMode:'live',source:'licensed-live',requestedPricingMode:'auto'});
});

test('auto falls back to labeled reference data', () => {
  const result=selectPaperQuote([quote(60,{evidenceClass:'delayed',livePull:false},'nasdaq-delayed')],'auto',now);
  expect(result.decision).toMatchObject({accepted:true,pricingMode:'reference',source:'nasdaq-delayed'});
});

test('live-only rejects delayed data', () => {
  const result=selectPaperQuote([quote(1,{evidenceClass:'delayed',livePull:false},'nasdaq-delayed')],'live',now);
  expect(result.snapshot).toBeNull();
  expect(result.decision).toMatchObject({accepted:false,reason:'live_quote_required'});
});

test('live-only rejects a stale live quote', () => {
  const result=selectPaperQuote([quote(6,{evidenceClass:'live',livePull:true},'licensed-live')],'live',now);
  expect(result.decision).toMatchObject({accepted:false,reason:'live_quote_stale'});
});

test('Nasdaq delayed can never qualify as live even if payload is wrong', () => {
  const result=selectPaperQuote([quote(1,{evidenceClass:'live',livePull:true},'nasdaq-delayed')],'live',now);
  expect(result.decision).toMatchObject({accepted:false,reason:'live_quote_required'});
});

test('reference mode rejects expired and future observations', () => {
  expect(selectPaperQuote([quote(7*24*60+1,{evidenceClass:'delayed',livePull:false})],'reference',now).decision.reason).toBe('reference_quote_stale');
  expect(selectPaperQuote([quote(-6,{evidenceClass:'delayed',livePull:false})],'reference',now).decision.reason).toBe('quote_timestamp_invalid');
});

test('no quote fails closed with an explicit reason', () => {
  expect(selectPaperQuote([],'auto',now).decision).toMatchObject({accepted:false,reason:'market_snapshot_required'});
});
