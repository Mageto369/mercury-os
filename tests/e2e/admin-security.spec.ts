import { expect, test } from "@playwright/test";

test("personal-server administration is open without a session", async ({
  request,
}) => {
  const headerCases: Array<Record<string, string>> = [
    {},
    { authorization: "Bearer wrong", origin: "https://other.example" },
  ];
  for (const headers of headerCases) {
    const session = await request.get("/api/admin/session", { headers });
    expect(session.status()).toBe(200);
    expect(await session.json()).toMatchObject({
      ok: true,
      configured: true,
      authenticated: true,
      accessMode: "personal-server-open",
    });
  }

  const settings = await request.get("/api/admin/settings");
  expect(settings.status()).not.toBe(401);
  expect(settings.status()).not.toBe(403);
});
