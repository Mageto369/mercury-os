import { expect, test } from "@playwright/test";
import {
  DEFAULT_SEC_USER_AGENT,
  getSecUserAgent,
  secIdentityStatus,
} from "@/lib/providers/sec-identity";

test("the built-in SEC identity is kept for display and rejected for ingestion", () => {
  const previous = process.env.SEC_USER_AGENT;
  delete process.env.SEC_USER_AGENT;
  expect(getSecUserAgent()).toBe(DEFAULT_SEC_USER_AGENT);
  expect(getSecUserAgent()).toContain("Mageto369/mercury-os");
  expect(secIdentityStatus().accepted).toBe(false);
  expect(secIdentityStatus().reason).toContain("email");
  if (previous === undefined) delete process.env.SEC_USER_AGENT;
  else process.env.SEC_USER_AGENT = previous;
});

test("operator SEC identity overrides the built-in identity", () => {
  const previous = process.env.SEC_USER_AGENT;
  process.env.SEC_USER_AGENT = "Personal Mercury contact@example.com";
  expect(getSecUserAgent()).toBe("Personal Mercury contact@example.com");
  expect(secIdentityStatus().accepted).toBe(true);
  process.env.SEC_USER_AGENT = "Mercury OS missing-email";
  expect(secIdentityStatus().accepted).toBe(false);
  if (previous === undefined) delete process.env.SEC_USER_AGENT;
  else process.env.SEC_USER_AGENT = previous;
});
