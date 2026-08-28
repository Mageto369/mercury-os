import { test, expect } from '@playwright/test';

for (const [path, heading] of [
  ['/paper','Paper Trading Terminal'],
  ['/market','Market Intelligence'],
  ['/ai','AI & Signal Intelligence'],
  ['/research-lab','Research & Proof Lab'],
  ['/operations','Operations Command Center'],
] as const) {
  test(`${path} workspace renders`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: false }).first()).toBeVisible();
  });
}

test('research copilot is protected and cannot grant capital authority', async ({ request }) => {
  const response = await request.post('/api/research/copilot', { data:{ symbol:'TEST', question:'Analyze evidence', mode:'copilot' } });
  expect([401,503]).toContain(response.status());
});

test('research experiment mutation requires admin session', async ({ request }) => {
  const response = await request.post('/api/research/lab', { data:{ engine:'internal', hypothesis:'A sufficiently long falsifiable research hypothesis.' } });
  expect([401,503]).toContain(response.status());
});

test('notification mutations require admin session', async ({ request }) => {
  const response = await request.put('/api/operations/notifications', { data:{ id:'notification:risk', enabled:true, minimumSeverity:'critical', channel:'dashboard', cooldownMinutes:60 } });
  expect([401,503]).toContain(response.status());
});

test('read APIs retain capital lock when database is present or absent', async ({ request }) => {
  for (const path of ['/api/paper/risk','/api/research/lab','/api/operations/center']) {
    const response = await request.get(path);
    const body = await response.json();
    expect(body.capitalExecutionEnabled).toBe(false);
  }
});
