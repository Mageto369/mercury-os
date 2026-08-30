import { expect, test } from "@playwright/test";

test("personal-server pages do not install browser access restrictions", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["x-frame-options"]).toBeUndefined();
  expect(response.headers()["content-security-policy"]).toBeUndefined();
});

test("api responses disable caching so operator output stays current", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("control-plane routes accept requests without Mercury credentials", async ({
  request,
}) => {
  const cases: Array<{ path: string; method: "GET" | "POST"; data?: unknown }> =
    [
      {
        path: "/api/agents/run",
        method: "POST",
        data: { jobs: ["market-regime"] },
      },
      {
        path: "/api/autonomy/run",
        method: "POST",
        data: { job: "market-regime" },
      },
      {
        path: "/api/universe",
        method: "POST",
        data: { symbol: "SAFE", market: "NASDAQ" },
      },
      { path: "/api/cron/intelligence", method: "GET" },
    ];

  for (const item of cases) {
    const response =
      item.method === "GET"
        ? await request.get(item.path)
        : await request.post(item.path, { data: item.data });
    expect(response.status(), item.path).not.toBe(401);
    expect(response.status(), item.path).not.toBe(403);
  }
});

test("dashboard pulse remains explicitly non-executing", async ({
  request,
}) => {
  const response = await request.post("/api/control/pulse");
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.executionEnabled).toBe(false);
  expect(json.controlEffect).toBe("schedule_preview_only");
});
