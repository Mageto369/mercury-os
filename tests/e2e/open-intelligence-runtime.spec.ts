import { expect, test } from "@playwright/test";
import { normalizeSidecarTimestamp } from "@/lib/integrations/open-intelligence-sync";

test("sidecar calendar timestamps stay primitive across the Postgres boundary", () => {
  const openAt = normalizeSidecarTimestamp("2026-09-02T13:30:00-04:00");
  const closeAt = normalizeSidecarTimestamp("2026-09-02T20:00:00Z");

  expect(typeof openAt).toBe("string");
  expect(openAt).toBe("2026-09-02T17:30:00.000Z");
  expect(closeAt).toBe("2026-09-02T20:00:00.000Z");
});

test("invalid sidecar calendar timestamps fail explicitly", () => {
  expect(() => normalizeSidecarTimestamp("not-a-timestamp")).toThrow(
    "invalid_sidecar_timestamp:not-a-timestamp",
  );
});
