import { test, expect } from '@playwright/test';

test('shadow performance defaults to live evidence', async ({ request }) => {
  const response=await request.get('/api/performance/shadow');
  expect(response.ok()).toBeTruthy();
  const body=await response.json();
  expect(body.scope).toBe('live');
  expect(body.liveEvidenceOnly).toBe(true);
  expect(body.syntheticRows).toBe(0);
  expect(body.capitalExecutionEnabled).toBe(false);
});

test('promotion gate requires clean live provenance', async ({ request }) => {
  const response=await request.get('/api/activation/promotion');
  expect(response.ok()).toBeTruthy();
  const body=await response.json();
  expect(body.evidenceScope).toBe('live');
  expect(body.liveEvidenceOnly).toBe(true);
  expect(body.syntheticRows).toBe(0);
  expect(body.capitalExecutionEnabled).toBe(false);
  expect(body.rules.some((rule:{key:string})=>rule.key==='provenance')).toBe(true);
});
