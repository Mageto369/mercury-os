import { expect, test } from "@playwright/test";

test("admin suite opens directly in personal-server mode", async ({
  page,
  request,
}) => {
  const session = await request.get("/api/admin/session");
  expect(session.ok()).toBeTruthy();
  const body = await session.json();
  expect(body.authenticated).toBe(true);
  expect(body.accessMode).toBe("personal-server-open");

  const settings = await request.get("/api/admin/settings");
  expect(settings.status()).toBe(503);

  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Admin Suite", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Loading configuration" }),
  ).toBeVisible();
});
