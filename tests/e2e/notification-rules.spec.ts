import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  conditionsMet,
  cooldownActive,
  matchRule,
  meetsSeverityFloor,
  normalizeSeverity,
  resolveChannel,
  validateDestination,
  type NotificationRule,
} from "../../lib/alerts/rules";
import { reportPersistedOutcomes } from "../../lib/alerts/router";

const rule = (overrides: Partial<NotificationRule> = {}): NotificationRule => ({
  id: "notification:test",
  rule_key: "test_rule",
  display_name: "Test rule",
  category: "operations",
  enabled: true,
  minimum_severity: "high",
  channel: "dashboard",
  destination: null,
  conditions: {},
  cooldown_minutes: 60,
  ...overrides,
});

const event = (overrides: Partial<Parameters<typeof matchRule>[1]> = {}) => ({
  category: "operations",
  severity: "high" as const,
  title: "Escalation",
  message: "Something happened",
  ...overrides,
});

test.describe("severity", () => {
  test('legacy "warning" maps to high rather than being dropped', () => {
    expect(normalizeSeverity("warning")).toBe("high");
    expect(normalizeSeverity("warn")).toBe("high");
  });

  test("unknown severities degrade to info, never upward", () => {
    expect(normalizeSeverity("catastrophic")).toBe("info");
    expect(normalizeSeverity(null)).toBe("info");
  });

  test("floors compare on a single ordered scale", () => {
    expect(meetsSeverityFloor("critical", "high")).toBe(true);
    expect(meetsSeverityFloor("high", "high")).toBe(true);
    expect(meetsSeverityFloor("medium", "high")).toBe(false);
    expect(meetsSeverityFloor("info", "critical")).toBe(false);
  });
});

test.describe("conditions", () => {
  test("an empty condition set matches everything", () => {
    expect(conditionsMet({}, {}).met).toBe(true);
    expect(conditionsMet(null, undefined).met).toBe(true);
  });

  test("min and max bounds are enforced against the payload", () => {
    expect(conditionsMet({ minConfidence: 80 }, { confidence: 85 }).met).toBe(
      true,
    );
    expect(conditionsMet({ minConfidence: 80 }, { confidence: 80 }).met).toBe(
      true,
    );
    expect(conditionsMet({ minConfidence: 80 }, { confidence: 79 }).met).toBe(
      false,
    );
    expect(conditionsMet({ maxSpreadBps: 500 }, { spreadBps: 400 }).met).toBe(
      true,
    );
    expect(conditionsMet({ maxSpreadBps: 500 }, { spreadBps: 900 }).met).toBe(
      false,
    );
  });

  test("a condition on a field the payload lacks fails closed", () => {
    const result = conditionsMet({ minConfidence: 80 }, { somethingElse: 99 });
    expect(result.met).toBe(false);
    expect(result.met === false && result.reason).toContain(
      "condition_field_missing",
    );
  });

  test("non-numeric payload values do not satisfy a numeric bound", () => {
    expect(
      conditionsMet({ minConfidence: 80 }, { confidence: "high" }).met,
    ).toBe(false);
    expect(
      conditionsMet({ minConfidence: 80 }, { confidence: Number.NaN }).met,
    ).toBe(false);
  });

  test("non-bound keys compare by equality", () => {
    expect(conditionsMet({ action: "buy" }, { action: "buy" }).met).toBe(true);
    expect(conditionsMet({ action: "buy" }, { action: "sell" }).met).toBe(
      false,
    );
  });
});

test.describe("rule matching", () => {
  test("a disabled rule never matches", () => {
    const result = matchRule(rule({ enabled: false }), event());
    expect(result.matched).toBe(false);
    expect(result.matched === false && result.reason).toBe("rule_disabled");
  });

  test("category must match the event", () => {
    const result = matchRule(
      rule({ category: "paper" }),
      event({ category: "operations" }),
    );
    expect(result.matched === false && result.reason).toBe("category_mismatch");
  });

  test("events below the severity floor are not delivered", () => {
    const result = matchRule(
      rule({ minimum_severity: "critical" }),
      event({ severity: "high" }),
    );
    expect(result.matched === false && result.reason).toBe(
      "below_minimum_severity",
    );
  });

  test("a fully satisfied rule matches", () => {
    expect(matchRule(rule(), event()).matched).toBe(true);
  });

  test("conditions are evaluated as part of matching", () => {
    const configured = rule({ conditions: { minConfidence: 80 } });
    expect(
      matchRule(configured, event({ payload: { confidence: 90 } })).matched,
    ).toBe(true);
    expect(
      matchRule(configured, event({ payload: { confidence: 10 } })).matched,
    ).toBe(false);
  });
});

test.describe("channel resolution fails closed", () => {
  test("dashboard resolves without external credentials", () => {
    expect(resolveChannel(rule({ channel: "dashboard" })).kind).toBe(
      "dashboard",
    );
  });

  test("email without an API key is unavailable, never delivered", () => {
    const resolved = resolveChannel(
      rule({ channel: "email", destination: "ops@example.com" }),
    );
    expect(resolved.kind).toBe("unavailable");
    expect(resolved.kind === "unavailable" && resolved.reason).toBe(
      "email_api_key_not_configured",
    );
  });

  test("email with a key but no sender is unavailable", () => {
    const resolved = resolveChannel(
      rule({ channel: "email", destination: "ops@example.com" }),
      { emailApiKey: "k" },
    );
    expect(resolved.kind === "unavailable" && resolved.reason).toBe(
      "email_sender_not_configured",
    );
  });

  test("email with no recipient on the rule is unavailable", () => {
    const resolved = resolveChannel(
      rule({ channel: "email", destination: null }),
      { emailApiKey: "k", emailFrom: "mercury@example.com" },
    );
    expect(resolved.kind === "unavailable" && resolved.reason).toBe(
      "email_recipient_not_configured",
    );
  });

  test("a malformed recipient is refused rather than handed to the mail API", () => {
    for (const bad of [
      "ops@example",
      "ops example.com",
      "a@b.c,d@e.fg",
      "<ops@example.com>",
      "",
    ]) {
      const resolved = resolveChannel(
        rule({ channel: "email", destination: bad }),
        { emailApiKey: "k", emailFrom: "mercury@example.com" },
      );
      expect(resolved.kind === "unavailable" && resolved.reason).toBe(
        "email_recipient_not_configured",
      );
    }
  });

  test("a fully configured email channel resolves to a real transport", () => {
    const resolved = resolveChannel(
      rule({ channel: "email", destination: "ops@example.com" }),
      { emailApiKey: "k", emailFrom: "mercury@example.com" },
    );
    expect(resolved.kind).toBe("email");
    if (resolved.kind !== "email") return;
    expect(resolved.to).toBe("ops@example.com");
    expect(resolved.from).toBe("mercury@example.com");
    expect(resolved.url).toBe("https://api.resend.com/emails");
  });

  test("the mail endpoint supports a personal-network destination", () => {
    const resolved = resolveChannel(
      rule({ channel: "email", destination: "ops@example.com" }),
      {
        emailApiKey: "k",
        emailFrom: "mercury@example.com",
        emailApiUrl: "https://127.0.0.1/emails",
      },
    );
    expect(resolved.kind).toBe("email");
  });

  test("webhook without any configured URL is unavailable", () => {
    const resolved = resolveChannel(rule({ channel: "webhook" }), {
      alertWebhookUrl: null,
    });
    expect(resolved.kind === "unavailable" && resolved.reason).toBe(
      "webhook_url_not_configured",
    );
  });

  test("webhook falls back to the environment URL when the rule has no destination", () => {
    const resolved = resolveChannel(rule({ channel: "webhook" }), {
      alertWebhookUrl: "https://hooks.example.com/a",
    });
    expect(resolved.kind).toBe("http");
    expect(resolved.kind === "http" && resolved.url).toBe(
      "https://hooks.example.com/a",
    );
  });

  test("a rule destination overrides the environment webhook", () => {
    const resolved = resolveChannel(
      rule({
        channel: "webhook",
        destination: "https://rule.example.com/hook",
      }),
      { alertWebhookUrl: "https://env.example.com/hook" },
    );
    expect(resolved.kind === "http" && resolved.url).toContain(
      "rule.example.com",
    );
  });

  test("slack requires its own destination and never borrows the generic webhook", () => {
    const resolved = resolveChannel(rule({ channel: "slack" }), {
      alertWebhookUrl: "https://env.example.com/hook",
    });
    expect(resolved.kind === "unavailable" && resolved.reason).toBe(
      "slack_webhook_url_not_configured",
    );
  });
});

test.describe("destination parsing", () => {
  test("accepts credentials embedded in a personal-server URL", () => {
    const result = validateDestination("https://user:pass@hooks.example.com/x");
    expect(result.ok).toBe(true);
  });

  test("accepts private and loopback hosts", () => {
    for (const host of [
      "http://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://192.168.1.9/x",
      "https://169.254.169.254/latest",
      "https://[::1]/x",
      "https://[::ffff:127.0.0.1]/x",
      "https://[fc00::1]/x",
      "https://foo.localhost/x",
      "https://metadata.google.internal/x",
    ]) {
      const result = validateDestination(host);
      expect(result.ok, host).toBe(true);
    }
  });

  test("accepts alternate IP literal encodings", () => {
    for (const host of [
      "https://2130706433/x",
      "https://0x7f000001/x",
      "https://0177.0.0.1/x",
    ]) {
      expect(validateDestination(host).ok, host).toBe(true);
    }
  });

  test("rejects malformed URLs", () => {
    expect(validateDestination("not a url").ok).toBe(false);
  });

  test("accepts a public https endpoint", () => {
    expect(validateDestination("https://hooks.example.com/services/x").ok).toBe(
      true,
    );
  });
});

test.describe("cooldown", () => {
  const now = new Date("2026-08-28T12:00:00Z");

  test("suppresses a repeat inside the window", () => {
    expect(cooldownActive("2026-08-28T11:30:00Z", 60, now)).toBe(true);
  });

  test("allows delivery once the window has elapsed", () => {
    expect(cooldownActive("2026-08-28T10:30:00Z", 60, now)).toBe(false);
  });

  test("a rule that has never delivered is not in cooldown", () => {
    expect(cooldownActive(null, 60, now)).toBe(false);
    expect(cooldownActive("not-a-date", 60, now)).toBe(false);
  });
});

test.describe("delivery evidence", () => {
  const dashboardOutcome = {
    ruleKey: "pipeline_failure",
    ruleName: "Pipeline failure",
    channel: "dashboard",
    destination: null,
    status: "delivered" as const,
    reason: "rendered_in_operations_center",
    error: null,
  };

  test("dashboard success requires committed history", () => {
    const [reported] = reportPersistedOutcomes([dashboardOutcome], false);
    expect(reported.status).toBe("failed");
    expect(reported.reason).toBe("dashboard_persistence_failed");
  });

  test("committed dashboard history remains delivered", () => {
    const [reported] = reportPersistedOutcomes([dashboardOutcome], true);
    expect(reported.status).toBe("delivered");
  });
});

test("seeded rule categories have production call sites", () => {
  const producers = [
    ["lib/agents/supervisor.ts", "operations"],
    ["lib/workflows/opportunity-engine.ts", "opportunity"],
    ["lib/workflows/sec-filings.ts", "filing"],
    ["lib/workflows/share-structure.ts", "risk"],
    ["lib/workflows/model-learning.ts", "model"],
    ["app/api/paper/orders/route.ts", "paper"],
  ] as const;

  for (const [relativePath, category] of producers) {
    const source = fs.readFileSync(
      path.join(process.cwd(), relativePath),
      "utf8",
    );
    expect(source, relativePath).toContain("routeOperationalAlert");
    expect(source, relativePath).toMatch(
      new RegExp(`category:\\s*['\"]${category}['\"]`),
    );
  }
});
