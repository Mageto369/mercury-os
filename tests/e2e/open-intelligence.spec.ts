import { expect, test } from "@playwright/test";

test("open intelligence sidecar is explicit and fail-closed", async ({
  request,
}) => {
  const status = await request.get("/api/integrations/open-intelligence");
  expect(status.ok()).toBeTruthy();
  const statusJson = await status.json();
  expect(statusJson.configured).toBe(false);
  expect(statusJson.reachable).toBe(false);
  expect(statusJson.capitalExecutionEnabled).toBe(false);

  const response = await request.post("/api/integrations/open-intelligence");
  expect(response.status()).toBe(503);
  const json = await response.json();
  expect(json.ok).toBe(false);
  expect(json.reason).toBe("database_not_configured");
});
