import { expect, test } from '@playwright/test';

for (const failed of [false, true]) {
  test(`status rail exposes ${failed ? 'persistence failure' : 'reference-only readiness'}`, async ({page}) => {
    await page.route('**/api/health', route => route.fulfill({json: {
      configuredProviders: 5, totalProviders: 18,
      runtime: {databaseConfigured:true,databaseReachable:true,schemaReady:true,marketProviderConfigured:false},
      warehouse: {liveSecurities:10160,marketSnapshots:129,liveMarketSnapshots:0,referenceMarketSnapshots:129,quotedSecurities:120},
      marketPipeline: {enabled:true,status:failed?'degraded':'success',lastRunAt:'2026-09-05T06:00:00Z',error:failed?'persistence_failed':null,overdue:false},
    }}));
    await page.route('**/api/market/intelligence', route => route.fulfill({json:{ok:true,scanner:[],referenceQuotes:[],watchlists:{},catalystCalendar:[]}}));
    await page.goto('/market');
    const rail = page.getByRole('button', {name: failed ? /^DEGRADED/ : /^REFERENCE DATA/});
    await expect(rail).toContainText('QUOTED 120');
    await expect(rail).toContainText('CAPITAL LOCKED');
    await expect(rail).not.toContainText('Ingesting live data');
    await rail.click();
    await expect(page.getByText('Live market feed unavailable', {exact:true})).toBeVisible();
    if (failed) await expect(page.getByText('persistence_failed', {exact:true})).toBeVisible();
  });
}
