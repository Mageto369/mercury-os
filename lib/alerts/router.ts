import { randomUUID } from 'node:crypto';
import { getSql } from '@/lib/db';
import {
  cooldownActive,
  matchRule,
  normalizeSeverity,
  resolveChannel,
  type AlertEvent,
  type AlertSeverity,
  type DeliveryStatus,
  type NotificationRule,
} from '@/lib/alerts/rules';

export type { AlertSeverity } from '@/lib/alerts/rules';

const DELIVERY_TIMEOUT_MS = 8000;

export interface DeliveryOutcome {
  ruleKey: string | null;
  ruleName: string | null;
  channel: string;
  destination: string | null;
  status: DeliveryStatus;
  reason: string | null;
  error: string | null;
}

export interface AlertRoutingResult {
  routed: boolean;
  persisted: boolean;
  rulesEvaluated: number;
  rulesMatched: number;
  delivered: number;
  skipped: number;
  unavailable: number;
  failed: number;
  outcomes: DeliveryOutcome[];
  shadowOnly: true;
  capitalExecutionEnabled: false;
}

function emptyResult(persisted: boolean, outcomes: DeliveryOutcome[] = []): AlertRoutingResult {
  return {
    routed: outcomes.some((o) => o.status === 'delivered'),
    persisted,
    rulesEvaluated: 0,
    rulesMatched: 0,
    delivered: outcomes.filter((o) => o.status === 'delivered').length,
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
    unavailable: outcomes.filter((o) => o.status === 'unavailable').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    outcomes,
    shadowOnly: true,
    capitalExecutionEnabled: false,
  };
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
}

/**
 * Route an operational alert through the configured notification rules.
 *
 * Every rule that matches produces exactly one persisted `alert_deliveries`
 * row describing what actually happened. A rule whose channel has no
 * credentials records `unavailable`; a transport error records `failed`. There
 * is no code path that records `delivered` without the delivery having
 * actually occurred.
 */
export async function routeOperationalAlert(input: {
  eventKey?: string;
  category?: string;
  severity: AlertSeverity | 'warning';
  title: string;
  message: string;
  payload?: Record<string, unknown>;
}): Promise<AlertRoutingResult> {
  const sql = getSql();
  const event: AlertEvent = {
    eventKey: input.eventKey,
    category: input.category ?? 'operations',
    severity: normalizeSeverity(input.severity),
    title: input.title,
    message: input.message,
    payload: input.payload,
  };

  const basePayload = {
    title: event.title,
    message: event.message,
    severity: event.severity,
    category: event.category,
    mode: 'shadow',
    capitalExecutionEnabled: false,
    ...event.payload,
  };

  if (!sql) {
    // No warehouse means no rules and no delivery history. Fail closed and say so.
    return emptyResult(false, [{
      ruleKey: null,
      ruleName: null,
      channel: 'none',
      destination: null,
      status: 'unavailable',
      reason: 'database_not_configured',
      error: null,
    }]);
  }

  let rules: NotificationRule[] = [];
  try {
    rules = await sql`
      select id, rule_key, display_name, category, enabled, minimum_severity,
             channel, destination, conditions, cooldown_minutes
      from notification_rules
      where shadow_only = true
      order by rule_key
    ` as unknown as NotificationRule[];
  } catch {
    return emptyResult(false, [{
      ruleKey: null,
      ruleName: null,
      channel: 'none',
      destination: null,
      status: 'unavailable',
      reason: 'notification_rules_unavailable',
      error: null,
    }]);
  }

  const matches = rules.map((rule) => matchRule(rule, event)).filter((m) => m.matched);
  const outcomes: DeliveryOutcome[] = [];

  if (matches.length === 0) {
    // An alert with no governing rule is a real gap, so it is recorded rather
    // than silently discarded.
    outcomes.push({
      ruleKey: null,
      ruleName: null,
      channel: 'none',
      destination: null,
      status: 'unavailable',
      reason: 'no_matching_rule',
      error: null,
    });
  }

  for (const match of matches) {
    const rule = match.rule;
    const resolution = resolveChannel(rule, { alertWebhookUrl: process.env.ALERT_WEBHOOK_URL });

    let lastDeliveredAt: string | null = null;
    try {
      const [row] = await sql`
        select created_at from alert_deliveries
        where payload->>'ruleKey' = ${rule.rule_key} and status = 'delivered'
        order by created_at desc limit 1
      `;
      lastDeliveredAt = row?.created_at ? String(row.created_at) : null;
    } catch { lastDeliveredAt = null; }

    if (cooldownActive(lastDeliveredAt, rule.cooldown_minutes)) {
      outcomes.push({
        ruleKey: rule.rule_key,
        ruleName: rule.display_name,
        channel: rule.channel,
        destination: rule.destination ?? null,
        status: 'skipped',
        reason: `cooldown_active_${rule.cooldown_minutes}m`,
        error: null,
      });
      continue;
    }

    if (resolution.kind === 'unavailable') {
      outcomes.push({
        ruleKey: rule.rule_key,
        ruleName: rule.display_name,
        channel: rule.channel,
        destination: rule.destination ?? null,
        status: 'unavailable',
        reason: resolution.reason,
        error: null,
      });
      continue;
    }

    if (resolution.kind === 'dashboard') {
      // The dashboard channel is satisfied by the persisted row itself: the
      // Operations Center renders alert_deliveries directly, so persistence is
      // the delivery rather than a stand-in for one.
      outcomes.push({
        ruleKey: rule.rule_key,
        ruleName: rule.display_name,
        channel: 'dashboard',
        destination: null,
        status: 'delivered',
        reason: 'rendered_in_operations_center',
        error: null,
      });
      continue;
    }

    try {
      await postJson(resolution.url, basePayload);
      outcomes.push({
        ruleKey: rule.rule_key,
        ruleName: rule.display_name,
        channel: resolution.channel,
        destination: resolution.url,
        status: 'delivered',
        reason: null,
        error: null,
      });
    } catch (cause) {
      outcomes.push({
        ruleKey: rule.rule_key,
        ruleName: rule.display_name,
        channel: resolution.channel,
        destination: resolution.url,
        status: 'failed',
        reason: 'transport_error',
        error: cause instanceof Error ? cause.message : 'unknown_delivery_error',
      });
    }
  }

  let persisted = false;
  try {
    for (const outcome of outcomes) {
      await sql`
        insert into alert_deliveries
          (id, event_key, severity, channel, destination, status, shadow_only, attempts, payload, error, delivered_at)
        values (
          ${randomUUID()}, ${event.eventKey ?? null}, ${event.severity}, ${outcome.channel},
          ${outcome.destination}, ${outcome.status}, true,
          ${outcome.status === 'delivered' || outcome.status === 'failed' ? 1 : 0},
          ${sql.json({ ...basePayload, ruleKey: outcome.ruleKey, ruleName: outcome.ruleName, reason: outcome.reason })},
          ${outcome.error}, ${outcome.status === 'delivered' ? new Date() : null}
        )
      `;
    }
    persisted = true;
  } catch { persisted = false; }

  return {
    routed: outcomes.some((o) => o.status === 'delivered'),
    persisted,
    rulesEvaluated: rules.length,
    rulesMatched: matches.length,
    delivered: outcomes.filter((o) => o.status === 'delivered').length,
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
    unavailable: outcomes.filter((o) => o.status === 'unavailable').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    outcomes,
    shadowOnly: true,
    capitalExecutionEnabled: false,
  };
}
