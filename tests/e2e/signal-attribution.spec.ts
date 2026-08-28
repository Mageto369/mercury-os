import { expect, test } from '@playwright/test';
import { conditionalExpectancy, correlationDecayMinutes } from '../../lib/intelligence/signal-metrics';

test('signal expectancy uses the observed win and loss distributions', () => {
  expect(conditionalExpectancy(2, 3, -1, 2)).toBeCloseTo(0.8, 10);
  expect(conditionalExpectancy(null, 0, -0.5, 4)).toBeCloseTo(-0.5, 10);
  expect(conditionalExpectancy(null, 0, null, 0)).toBe(0);
});

test('signal decay measures predictive-correlation half-life', () => {
  expect(correlationDecayMinutes([
    { minutes:15, correlation:0.4 },
    { minutes:60, correlation:0.1 },
    { minutes:1440, correlation:0.02 },
  ])).toBe(45);
  expect(correlationDecayMinutes([
    { minutes:15, correlation:-0.4 },
    { minutes:60, correlation:0.2 },
  ])).toBe(30);
  expect(correlationDecayMinutes([
    { minutes:15, correlation:0.2 },
    { minutes:60, correlation:0.18 },
    { minutes:1440, correlation:0.15 },
  ])).toBeNull();
});
