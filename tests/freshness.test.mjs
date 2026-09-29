import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDomainFreshness, usableTimestamp } from '../lib/agents/freshness.ts';
import { agentTelemetryLimitMinutes } from '../lib/risk/telemetry-window.ts';

const now = Date.parse('2026-09-29T03:00:00.000Z');
const hours = (value) => value * 60 * 60 * 1000;

test('a future period end does not keep structure fresh', () => {
  const result = classifyDomainFreshness({
    count: 255,
    observedAt: '2027-07-17T00:00:00.000Z',
    ingestedAt: null,
    now,
    maxAgeMs: hours(72),
  });
  assert.equal(result.status, 'stale');
  assert.equal(result.clock, null);
});

test('a recent ingestion clock stays fresh when the period end is in the future', () => {
  const result = classifyDomainFreshness({
    count: 255,
    observedAt: '2027-07-17T00:00:00.000Z',
    ingestedAt: '2026-09-29T02:00:00.000Z',
    now,
    maxAgeMs: hours(72),
  });
  assert.equal(result.status, 'fresh');
  assert.equal(result.clockSource, 'ingest');
  assert.equal(result.clock?.toISOString(), '2026-09-29T02:00:00.000Z');
});

test('an ingestion clock older than the window is stale', () => {
  const result = classifyDomainFreshness({
    count: 10,
    observedAt: '2026-09-28T00:00:00.000Z',
    ingestedAt: '2026-09-20T00:00:00.000Z',
    now,
    maxAgeMs: hours(72),
  });
  assert.equal(result.status, 'stale');
  assert.equal(result.clockSource, 'ingest');
});

test('no rows and no ingestion clock is absent', () => {
  const result = classifyDomainFreshness({
    count: 0,
    observedAt: null,
    ingestedAt: null,
    now,
    maxAgeMs: hours(72),
  });
  assert.equal(result.status, 'absent');
});

test('a recent period end can stand in until an ingestion clock exists', () => {
  const result = classifyDomainFreshness({
    count: 4,
    observedAt: '2026-09-28T12:00:00.000Z',
    now,
    maxAgeMs: hours(72),
  });
  assert.equal(result.status, 'fresh');
  assert.equal(result.clockSource, 'observed');
});

test('a daily agent is not stale inside its own cadence', () => {
  assert.equal(agentTelemetryLimitMinutes([1440], 35), 1440);
  assert.equal(agentTelemetryLimitMinutes([15, 30], 35), 35);
  assert.equal(agentTelemetryLimitMinutes([], 35), 35);
});

test('a timestamp more than five minutes ahead is not usable', () => {
  assert.equal(usableTimestamp('2026-09-29T03:04:00.000Z', now)?.toISOString(), '2026-09-29T03:04:00.000Z');
  assert.equal(usableTimestamp('2026-09-29T04:00:00.000Z', now), null);
  assert.equal(usableTimestamp('not-a-date', now), null);
});
