import { expect, test } from "@playwright/test";

test.use({timezoneId: 'America/Chicago'});

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
