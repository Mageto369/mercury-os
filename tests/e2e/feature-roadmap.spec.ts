import { test, expect } from "@playwright/test";

for (const [path, heading] of [
  ["/paper", "Paper Trading Terminal"],
  ["/market", "Market Intelligence"],
  ["/ai", "AI & Signal Intelligence"],
  ["/research-lab", "Research & Proof Lab"],
  ["/operations", "Operations Command Center"],
] as const) {
  test(`${path} workspace renders`, async ({ page }) => {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, exact: false }).first(),
    ).toBeVisible();
  });
}

test("research copilot is open and cannot grant capital authority", async ({
  request,
}) => {
  const response = await request.post("/api/research/copilot", {
    data: { symbol: "TEST", question: "Analyze evidence", mode: "copilot" },
  });
  expect(response.status()).toBe(503);
});

test("research experiment mutation is open and requires persistence", async ({
  request,
}) => {
  const response = await request.post("/api/research/lab", {
    data: {
      engine: "internal",
      hypothesis: "A sufficiently long falsifiable research hypothesis.",
    },
  });
  expect(response.status()).toBe(503);
});

test("notification mutations are open and require persistence", async ({
  request,
}) => {
  const response = await request.put("/api/operations/notifications", {
    data: {
      id: "notification:risk",
      enabled: true,
      minimumSeverity: "critical",
      channel: "dashboard",
      cooldownMinutes: 60,
    },
  });
  expect(response.status()).toBe(503);
});

test("operations runs a full cycle and renders the persisted pipeline summary", async ({
  page,
}) => {
  await page.route("**/api/operations/center", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        readiness: { database: true, capitalExecutionEnabled: false },
        pipelines: [],
        providers: [],
        workflows: [],
        dataQuality: { counts: {}, checks: {}, issueCount: 0 },
        notifications: { rules: [], deliveries: [] },
      }),
    });
  });
  await page.route("**/api/cron/intelligence", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        completed: 2,
        degraded: 1,
        skipped: 0,
        pipelineResults: {
          "sec-filings": { status: "success", error: null },
          "market-snapshots": {
            status: "degraded",
            error: "market-provider: provider_not_configured",
          },
        },
      }),
    });
  });

  await page.goto("/operations");
  await page.getByRole("button", { name: "Run full cycle" }).click();
  await expect(page.getByRole("heading", { name: "Latest manual cycle" })).toBeVisible();
  await expect(page.getByText("sec-filings")).toBeVisible();
  await expect(page.getByText("market-provider: provider_not_configured")).toBeVisible();
});

test("read APIs retain capital lock when database is present or absent", async ({
  request,
}) => {
  for (const path of [
    "/api/paper/risk",
    "/api/research/lab",
    "/api/operations/center",
  ]) {
    const response = await request.get(path);
    const body = await response.json();
    expect(body.capitalExecutionEnabled).toBe(false);
  }
});
