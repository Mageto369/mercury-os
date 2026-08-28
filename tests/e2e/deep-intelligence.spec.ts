import { test, expect } from '@playwright/test';

test('deep intelligence status fails closed without database', async ({ request }) => {
  const response=await request.get('/api/intelligence/deep');
  expect(response.ok()).toBeTruthy();
  const body=await response.json();
  expect(body.available).toBe(false);
  expect(body.reason).toBe('database_not_configured');
  expect(body.shadowOnly).toBe(true);
  expect(body.capitalExecutionEnabled).toBe(false);
});

test('deep intelligence mutation is protected', async ({ request }) => {
  const response=await request.post('/api/intelligence/deep');
  expect(response.status()).toBe(401);
});
