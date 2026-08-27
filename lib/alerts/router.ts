import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { alertDeliveries } from '@/lib/db/ops-schema';

export type AlertSeverity = 'info' | 'warning' | 'high' | 'critical';

export async function routeOperationalAlert(input: {
  eventKey?: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  const db = getDb();
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  const id = randomUUID();
  const basePayload = {
    title: input.title,
    message: input.message,
    severity: input.severity,
    mode: 'shadow',
    capitalExecutionEnabled: false,
    ...input.payload,
  };

  if (!webhookUrl) {
    if (db) {
      await db.insert(alertDeliveries).values({
        id,
        eventKey: input.eventKey,
        severity: input.severity,
        channel: 'none',
        status: 'queued_no_channel',
        shadowOnly: true,
        attempts: 0,
        payload: basePayload,
      });
    }
    return { delivered: false as const, persisted: Boolean(db), reason: 'alert_channel_not_configured' as const };
  }

  let status = 'failed';
  let error: string | null = null;
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(basePayload),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`webhook_http_${response.status}`);
    status = 'delivered';
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'unknown_alert_error';
  }

  if (db) {
    await db.insert(alertDeliveries).values({
      id,
      eventKey: input.eventKey,
      severity: input.severity,
      channel: 'webhook',
      destination: 'configured_webhook',
      status,
      shadowOnly: true,
      attempts: 1,
      payload: basePayload,
      error,
      deliveredAt: status === 'delivered' ? new Date() : null,
    });
  }

  return { delivered: status === 'delivered', persisted: Boolean(db), error };
}
