import { expect, test } from "@playwright/test";
import {
  identityProviderUrls,
  isProviderOutage,
  normalizeSidecarTimestamp,
  summarizeProviderBatch,
} from "@/lib/integrations/open-intelligence-sync";

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

test("provider batches fail when every attempted request fails", () => {
  expect(summarizeProviderBatch("macro", 5, 5)).toEqual({
    ok: false,
    reason: "all_macro_requests_failed",
  });
  expect(summarizeProviderBatch("identity", 100, 100)).toEqual({
    ok: false,
    reason: "all_identity_requests_failed",
  });
});

test("provider batches accept partial success and empty work", () => {
  expect(summarizeProviderBatch("macro", 5, 4)).toEqual({ ok: true });
  expect(summarizeProviderBatch("form4", 0, 0)).toEqual({ ok: true });
});

test("identity enrichment only uses dedicated provider URLs", () => {
  expect(identityProviderUrls({OPEN_INTELLIGENCE_URL:"https://shared.example"})).toEqual({
    mapperUrl:null,
    financeUrl:null,
  });
  expect(identityProviderUrls({
    SEC_CIK_MAPPER_URL:" https://mapper.example ",
    FINANCE_DATABASE_URL:"https://finance.example",
  })).toEqual({
    mapperUrl:"https://mapper.example",
    financeUrl:"https://finance.example",
  });
});

test("provider outage classification only trips on transport and server failures", () => {
  expect(isProviderOutage("http_502")).toBe(true);
  expect(isProviderOutage("http_503")).toBe(true);
  expect(isProviderOutage("fetch failed")).toBe(true);
  expect(isProviderOutage("The operation was aborted")).toBe(true);
  expect(isProviderOutage("http_404")).toBe(false);
  expect(isProviderOutage("sidecar_invalid_json")).toBe(true);
});
