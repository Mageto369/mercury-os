import { expect, test } from "@playwright/test";
import {
  DEFAULT_SEC_USER_AGENT,
  getSecUserAgent,
} from "@/lib/providers/sec-identity";

test("SEC ingestion has a usable repository identity by default", () => {
  const previous = process.env.SEC_USER_AGENT;
  delete process.env.SEC_USER_AGENT;
  expect(getSecUserAgent()).toBe(DEFAULT_SEC_USER_AGENT);
  expect(getSecUserAgent()).toContain("Mageto369/mercury-os");
  if (previous === undefined) delete process.env.SEC_USER_AGENT;
  else process.env.SEC_USER_AGENT = previous;
});

test("operator SEC identity overrides the built-in identity", () => {
  const previous = process.env.SEC_USER_AGENT;
  process.env.SEC_USER_AGENT = "Personal Mercury contact@example.com";
  expect(getSecUserAgent()).toBe("Personal Mercury contact@example.com");
  if (previous === undefined) delete process.env.SEC_USER_AGENT;
  else process.env.SEC_USER_AGENT = previous;
});
