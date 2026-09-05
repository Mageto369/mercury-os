import { expect, test } from "@playwright/test";
import { isRuntimeIntegrationConfigured } from "@/lib/admin/integration-runtime";

test("environment credentials remain valid runtime configuration", async () => {
  const previous = process.env.MASSIVE_API_KEY;
  process.env.MASSIVE_API_KEY = "test-market-key";
  try {
    await expect(
      isRuntimeIntegrationConfigured("massive", ["MASSIVE_API_KEY"]),
    ).resolves.toBe(true);
  } finally {
    if (previous === undefined) delete process.env.MASSIVE_API_KEY;
    else process.env.MASSIVE_API_KEY = previous;
  }
});

test("Admin shows live health and enables a newly credentialed provider", async ({
  page,
}) => {
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/health", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configuredProviders: 3,
        totalProviders: 18,
        requiredRuntimeReady: true,
        runtime: { databaseReachable: true, schemaReady: true },
        warehouse: { liveSecurities: 10160 },
      }),
    }),
  );
  await page.route("**/api/admin/settings", async (route) => {
    if (route.request().method() === "PUT") {
      saved = (await route.request().postDataJSON()) as Record<string, unknown>;
      await route.fulfill({ contentType: "application/json", body: '{"ok":true}' });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        credentialStorage: "plaintext",
        catalog: [
          {
            id: "massive",
            category: "market",
            provider: "massive",
            displayName: "Massive Market Data",
            capabilities: ["quotes", "snapshots", "historical"],
            secretName: "api_key",
          },
        ],
        ingestionCatalog: [],
        integrations: [],
        ingestion: [],
        monitoring: [],
        audit: [],
      }),
    });
  });

  await page.goto("/admin");
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await page.getByLabel("Credential").fill("new-market-key");
  await page.getByRole("button", { name: "Save and enable" }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect(saved).toMatchObject({
    type: "integration",
    value: { id: "massive", enabled: true, secret: "new-market-key" },
  });
  await expect(page.getByText("Saved and enabled")).toBeVisible();
});
