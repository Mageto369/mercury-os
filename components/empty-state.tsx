'use client';

import type { EmptyReason } from '@/lib/system/health-state';

/**
 * One empty state with distinct, honest variants.
 *
 * Every workspace previously rendered some version of "no data" whether the
 * database was unconfigured, ingestion had never run, outcomes had not matured,
 * or a filter simply excluded everything. Those need different words and
 * different operator actions.
 */
const COPY: Record<EmptyReason, { title: string; body: string; tone: 'blocked' | 'waiting' | 'neutral' }> = {
  'not-configured': {
    title: 'Not connected to a warehouse',
    body: 'DATABASE_URL is not set, so nothing is being read or recorded. This is a configuration gap, not an absence of market activity.',
    tone: 'blocked',
  },
  unreachable: {
    title: 'Warehouse unreachable',
    body: 'The connection is configured but not responding. Existing data is intact; nothing can be read until the connection recovers.',
    tone: 'blocked',
  },
  'awaiting-ingestion': {
    title: 'No data ingested yet',
    body: 'The pipeline has not yet produced rows for this surface. Configure a provider and run one ingestion cycle.',
    tone: 'waiting',
  },
  'awaiting-maturity': {
    title: 'Awaiting outcome maturity',
    body: 'Opportunities exist but none have matured yet. Horizons resolve against real elapsed market time and cannot be accelerated.',
    tone: 'waiting',
  },
  'no-match': {
    title: 'No rows match',
    body: 'Data exists for this surface, but nothing matches the current selection. Widen the filter to see rows.',
    tone: 'neutral',
  },
  none: { title: '', body: '', tone: 'neutral' },
};

export function EmptyState({
  reason,
  title,
  body,
  hint,
}: {
  reason: EmptyReason;
  /** Overrides for surface-specific wording. */
  title?: string;
  body?: string;
  hint?: string;
}) {
  if (reason === 'none') return null;
  const copy = COPY[reason] ?? COPY['awaiting-ingestion'];

  return (
    <div className="empty-state" data-tone={copy.tone} data-reason={reason} role="status">
      <div className="empty-state-mark" aria-hidden="true" />
      <div className="empty-state-body">
        <b>{title ?? copy.title}</b>
        <span>{body ?? copy.body}</span>
        {hint && <span className="empty-state-hint">{hint}</span>}
      </div>
    </div>
  );
}
