import { expect, test } from "@playwright/test";

test.use({timezoneId: 'America/Chicago'});

test("command center labels delayed-reference opportunities as research context", async ({ page }) => {
  await page.route("**/api/opportunities", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        generatedAt: "2026-09-29T02:00:00.000Z",
        mode: "warehouse",
        evidenceScope: "delayed-reference",
        liveEvidenceOnly: false,
        count: 1,
        opportunities: [
          {
            id: "opp-actu",
            input: {
              symbol: "ACTU",
              market: "NASDAQ",
              price: 0.74,
              gem: 12,
              wave: 8,
              catalyst: 10,
              social: 4,
              liquidity: 20,
              trapRisk: 15,
              peakRisk: 9,
              confidence: 30,
            },
            decision: {
              alpha: 22,
              asymmetry: 31,
              aggression: 1,
              action: "WATCH",
              hardBlocked: false,
              reasons: ["delayed-reference evidence"],
            },
            modelVersion: "mercury-delayed-reference-v1",
          },
        ],
      }),
    }),
  );
  await page.goto("/");
  await expect(page.getByText("DELAYED REFERENCE", { exact: false })).toBeVisible();
  await expect(page.getByText("LIVE EVIDENCE ONLY")).toHaveCount(0);
  await expect(page.getByText("Reference Opportunities")).toBeVisible();
  await expect(page.getByText("not live proof").first()).toBeVisible();
  await expect(page.getByText("Selected delayed-reference opportunity")).toBeVisible();
  await expect(page.getByRole("region", { name: "Command deck" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asymmetry ladder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Virtual book" })).toBeVisible();
  await page.getByLabel("Filter opportunities").fill("ACTU");
  await expect(page.getByRole("row", { name: /ACTU/ })).toBeVisible();
});

test("Market separates delayed quotes from live opportunity scoring", async ({
  page,
}) => {
  await page.route("**/api/market/intelligence", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        mode: "live-with-delayed-reference",
        scanner: [],
        watchlists: {},
        referenceQuotes: [
          {
            symbol: "AAPL",
            name: "Apple Inc.",
            market: "NASDAQ",
            price: 319.97,
            volume: 39607187,
            dollar_volume: 12672952433.39,
            observed_at: "2026-09-04T00:00:00.000Z",
            source: "nasdaq-delayed",
          },
        ],
        catalystCalendar: [],
        regime: null,
        capitalExecutionEnabled: false,
      }),
    }),
  );
  await page.goto("/market");
  await expect(page.getByText("No live opportunities yet")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Delayed Reference Quotes" }),
  ).toBeVisible();
  const referenceSection = page
    .getByRole("heading", { name: "Delayed Reference Quotes" })
    .locator("..")
    .locator("..")
    .locator("..");
  await expect(referenceSection.getByText("AAPL", { exact: true })).toBeVisible();
  await expect(referenceSection.getByText("$319.9700")).toBeVisible();
  await expect(referenceSection.getByText("nasdaq-delayed")).toBeVisible();
  await expect(referenceSection.getByText('2026-09-04', {exact: true})).toBeVisible();
  await expect(
    referenceSection.getByText(
      "These rows do not enter live opportunity scoring.",
      { exact: false },
    ),
  ).toBeVisible();
});
