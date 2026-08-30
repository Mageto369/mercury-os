import { expect, test } from "@playwright/test";

test("open data mesh exposes authoritative provider contract without persistence", async ({
  request,
}) => {
  const status = await request.get("/api/providers/open-data/status");
  expect(status.ok()).toBeTruthy();
  const json = await status.json();
  expect(json.available).toBe(false);
  expect(json.reason).toBe("database_not_configured");
  expect(json.mode).toBe("shadow");
  expect(json.capitalExecutionEnabled).toBe(false);
  expect(json.providers).toHaveLength(3);
  expect(
    json.providers.find(
      (p: { provider: string }) => p.provider === "sec-companyfacts",
    ).authoritative,
  ).toBe(true);
  expect(
    json.providers.find(
      (p: { provider: string }) => p.provider === "sec-companyfacts",
    ).configured,
  ).toBe(true);
  expect(
    json.providers.find(
      (p: { provider: string }) => p.provider === "finra-regsho",
    ).authoritative,
  ).toBe(true);
  expect(
    json.providers.find((p: { provider: string }) => p.provider === "openbb")
      .authoritative,
  ).toBe(false);
});

test("manual intelligence cycle forces enabled pipelines without capital authority", async ({
  request,
}) => {
  const response = await request.post("/api/cron/intelligence");
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.forced).toBe(true);
  expect(json.capitalExecutionEnabled).toBe(false);
  expect(Object.keys(json.pipelineResults)).toEqual(
    expect.arrayContaining(["market-snapshots", "sec-filings"]),
  );
});

test("open data pull is open and reports a missing database", async ({
  request,
}) => {
  const response = await request.post("/api/providers/open-data/pull");
  expect(response.status()).toBe(503);
  const json = await response.json();
  expect(json.ok).toBe(false);
  expect(json.capitalExecutionEnabled).toBe(false);
});
