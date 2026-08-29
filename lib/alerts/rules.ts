import { isIP } from 'node:net';

/**
 * Notification rule evaluation.
 *
 * `notification_rules` used to be stored and rendered but never consulted: the
 * alert router posted every alert to a single global webhook and ignored
 * enabled state, category, severity floors, cooldowns, channels and
 * destinations entirely. This module is the evaluator that makes those rules
 * actually govern delivery.
 *
 * Everything here is pure so it can be tested without a database or network.
 */

export type AlertSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type AlertChannel = 'dashboard' | 'email' | 'slack' | 'webhook';

/** Terminal state of one delivery attempt. Never optimistic. */
export type DeliveryStatus = 'delivered' | 'skipped' | 'unavailable' | 'failed';

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Legacy callers used 'warning'; it maps to 'high' rather than being dropped. */
export function normalizeSeverity(value: string | null | undefined): AlertSeverity {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'warning' || raw === 'warn') return 'high';
  if (raw in SEVERITY_RANK) return raw as AlertSeverity;
  return 'info';
}

export function severityRank(value: string | null | undefined) {
  return SEVERITY_RANK[normalizeSeverity(value)];
}

export function meetsSeverityFloor(eventSeverity: string, ruleMinimum: string) {
  return severityRank(eventSeverity) >= severityRank(ruleMinimum);
}

export interface NotificationRule {
  id: string;
  rule_key: string;
  display_name: string;
  category: string;
  enabled: boolean;
  minimum_severity: string;
  channel: string;
  destination: string | null;
  conditions: Record<string, unknown> | null;
  cooldown_minutes: number;
}

export interface AlertEvent {
  eventKey?: string;
  category: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
}

/**
 * Evaluate a rule's `conditions` against the event payload.
 *
 * Supported shapes, matching the seeded rules and generalising from them:
 *   { "minConfidence": 80 }  -> payload.confidence >= 80
 *   { "maxSpreadBps": 500 }  -> payload.spreadBps <= 500
 *   { "action": "buy" }      -> payload.action === "buy"
 *
 * Fails closed: a condition referencing a field the payload does not carry is
 * treated as unmet, so an under-specified event cannot trigger a notification.
 */
export function conditionsMet(
  conditions: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown> | undefined,
): { met: true } | { met: false; reason: string } {
  if (!conditions || typeof conditions !== 'object') return { met: true };
  const entries = Object.entries(conditions);
  if (entries.length === 0) return { met: true };
  const data = payload ?? {};

  for (const [key, expected] of entries) {
    const bound = boundFromKey(key);
    if (bound) {
      const actual = data[bound.field];
      if (typeof actual !== 'number' || !Number.isFinite(actual)) {
        return { met: false, reason: `condition_field_missing:${bound.field}` };
      }
      if (typeof expected !== 'number' || !Number.isFinite(expected)) {
        return { met: false, reason: `condition_threshold_invalid:${key}` };
      }
      if (bound.kind === 'min' && actual < expected) return { met: false, reason: `below_${key}` };
      if (bound.kind === 'max' && actual > expected) return { met: false, reason: `above_${key}` };
      continue;
    }
    if (!(key in data)) return { met: false, reason: `condition_field_missing:${key}` };
    if (data[key] !== expected) return { met: false, reason: `condition_mismatch:${key}` };
  }
  return { met: true };
}

const BOUND_KEY = /^(min|max)([A-Z][A-Za-z0-9]*)$/;

function boundFromKey(key: string): { kind: 'min' | 'max'; field: string } | null {
  const match = BOUND_KEY.exec(key);
  if (!match) return null;
  const [, kind, rest] = match;
  return { kind: kind as 'min' | 'max', field: rest.charAt(0).toLowerCase() + rest.slice(1) };
}

export type RuleMatch =
  | { matched: true; rule: NotificationRule }
  | { matched: false; rule: NotificationRule; reason: string };

export function matchRule(rule: NotificationRule, event: AlertEvent): RuleMatch {
  if (!rule.enabled) return { matched: false, rule, reason: 'rule_disabled' };
  if (rule.category !== event.category) return { matched: false, rule, reason: 'category_mismatch' };
  if (!meetsSeverityFloor(event.severity, rule.minimum_severity)) {
    return { matched: false, rule, reason: 'below_minimum_severity' };
  }
  const conditions = conditionsMet(rule.conditions, event.payload);
  if (!conditions.met) return { matched: false, rule, reason: conditions.reason };
  return { matched: true, rule };
}

/**
 * Resolve where a matched rule should actually deliver.
 *
 * Fails closed: a channel whose credentials or destination are absent resolves
 * to `unavailable`, never to a silent success.
 */
export type ChannelResolution =
  | { kind: 'dashboard' }
  | { kind: 'http'; channel: 'slack' | 'webhook'; url: string }
  | { kind: 'email'; url: string; apiKey: string; from: string; to: string }
  | { kind: 'unavailable'; reason: string };

/** A recipient Mercury is willing to hand to a mail API. */
export function validEmailAddress(value: string | null | undefined) {
  const address = String(value ?? '').trim();
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[A-Za-z]{2,}$/.test(address) ? address : null;
}

export interface AlertEnv {
  alertWebhookUrl?: string | null;
  emailApiUrl?: string | null;
  emailApiKey?: string | null;
  emailFrom?: string | null;
}

export function resolveChannel(
  rule: NotificationRule,
  env: AlertEnv = {},
): ChannelResolution {
  const channel = String(rule.channel ?? 'dashboard') as AlertChannel;

  if (channel === 'dashboard') return { kind: 'dashboard' };

  if (channel === 'email') {
    // Mercury sends mail through an HTTP mail API rather than shipping an SMTP
    // client. Without the key, the address or a sender there is nothing to send
    // with, and the rule records `unavailable` rather than a fabricated success.
    const apiKey = String(env.emailApiKey ?? '').trim();
    if (!apiKey) return { kind: 'unavailable', reason: 'email_api_key_not_configured' };
    const from = validEmailAddress(env.emailFrom);
    if (!from) return { kind: 'unavailable', reason: 'email_sender_not_configured' };
    const to = validEmailAddress(rule.destination);
    if (!to) return { kind: 'unavailable', reason: 'email_recipient_not_configured' };
    const url = String(env.emailApiUrl ?? 'https://api.resend.com/emails').trim();
    const validated = validateDestination(url);
    if (!validated.ok) return { kind: 'unavailable', reason: validated.reason };
    return { kind: 'email', url: validated.url, apiKey, from, to };
  }

  const target = channel === 'slack'
    ? rule.destination
    : (rule.destination ?? env.alertWebhookUrl ?? null);

  if (!target) {
    return {
      kind: 'unavailable',
      reason: channel === 'slack' ? 'slack_webhook_url_not_configured' : 'webhook_url_not_configured',
    };
  }

  const validated = validateDestination(target);
  if (!validated.ok) return { kind: 'unavailable', reason: validated.reason };
  return { kind: 'http', channel, url: validated.url };
}

const INTERNAL_HOST_SUFFIX = /(^|\.)(localhost|local|internal|home\.arpa)\.?$/i;

/**
 * Destinations are admin-editable, so they are an SSRF surface. This blocks the
 * obvious internal targets and credential-bearing URLs. It is host-literal
 * based only: it cannot stop a public hostname that resolves to a private
 * address, which remains a known limitation.
 */
export function validateDestination(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'destination_url_invalid' };
  }
  if (url.protocol !== 'https:') {
    if (!(url.protocol === 'http:' && process.env.NODE_ENV !== 'production')) {
      return { ok: false, reason: 'destination_https_required' };
    }
  }
  if (url.username || url.password) return { ok: false, reason: 'destination_url_credentials_not_allowed' };
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  // URL canonicalises integer, hexadecimal, and octal IPv4 forms before this
  // check. Reject every IP literal, including IPv4-mapped and private IPv6,
  // rather than maintaining an incomplete list of special address ranges.
  if (isIP(hostname) !== 0 || INTERNAL_HOST_SUFFIX.test(hostname)) {
    return { ok: false, reason: 'destination_private_host_not_allowed' };
  }
  return { ok: true, url: url.toString() };
}

export function cooldownActive(
  lastDeliveredAt: Date | string | null | undefined,
  cooldownMinutes: number,
  now: Date = new Date(),
) {
  if (!lastDeliveredAt) return false;
  const last = lastDeliveredAt instanceof Date ? lastDeliveredAt : new Date(lastDeliveredAt);
  if (Number.isNaN(last.getTime())) return false;
  const minutes = Math.max(1, Number(cooldownMinutes) || 1);
  return now.getTime() - last.getTime() < minutes * 60_000;
}
