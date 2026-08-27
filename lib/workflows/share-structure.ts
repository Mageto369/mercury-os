import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { securities, shareStructures, systemEvents } from '@/lib/db/schema';

export interface ShareStructureChange {
  securityId: string;
  symbol: string;
  outstandingChangePct: number | null;
  floatChangePct: number | null;
  authorizedChangePct: number | null;
  riskScore: number;
}

export interface ShareStructureWorkflowResult {
  observationsChecked: number;
  securitiesCompared: number;
  changes: ShareStructureChange[];
  eventsCreated: number;
}

function pctChange(current: string | null, previous: string | null) {
  if (!current || !previous) return null;
  const a = Number(current);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return ((a - b) / b) * 100;
}

function riskFromChanges(outstanding: number | null, float: number | null, authorized: number | null) {
  const positive = [outstanding, float, authorized].filter((value): value is number => value !== null && value > 0);
  if (!positive.length) return 0;
  const max = Math.max(...positive);
  if (max >= 100) return 90;
  if (max >= 50) return 78;
  if (max >= 25) return 65;
  if (max >= 10) return 48;
  return Math.round(Math.min(40, max * 3));
}

export async function runShareStructureWorkflow(): Promise<ShareStructureWorkflowResult> {
  const db = getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const rows = await db
    .select({
      id: shareStructures.id,
      securityId: shareStructures.securityId,
      symbol: securities.symbol,
      authorizedShares: shareStructures.authorizedShares,
      outstandingShares: shareStructures.outstandingShares,
      floatShares: shareStructures.floatShares,
      observedAt: shareStructures.observedAt,
    })
    .from(shareStructures)
    .innerJoin(securities, eq(shareStructures.securityId, securities.id))
    .orderBy(desc(shareStructures.observedAt))
    .limit(5000);

  const recentBySecurity = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = recentBySecurity.get(row.securityId) ?? [];
    if (list.length < 2) list.push(row);
    recentBySecurity.set(row.securityId, list);
  }

  const changes: ShareStructureChange[] = [];
  let eventsCreated = 0;

  for (const [securityId, observations] of recentBySecurity) {
    if (observations.length < 2) continue;
    const [current, previous] = observations;
    const outstandingChangePct = pctChange(current.outstandingShares, previous.outstandingShares);
    const floatChangePct = pctChange(current.floatShares, previous.floatShares);
    const authorizedChangePct = pctChange(current.authorizedShares, previous.authorizedShares);
    const riskScore = riskFromChanges(outstandingChangePct, floatChangePct, authorizedChangePct);

    const change = {
      securityId,
      symbol: current.symbol,
      outstandingChangePct: outstandingChangePct === null ? null : Number(outstandingChangePct.toFixed(1)),
      floatChangePct: floatChangePct === null ? null : Number(floatChangePct.toFixed(1)),
      authorizedChangePct: authorizedChangePct === null ? null : Number(authorizedChangePct.toFixed(1)),
      riskScore,
    };
    changes.push(change);

    if (riskScore >= 48) {
      const result = await db.insert(systemEvents).values({
        id: randomUUID(),
        eventKey: `structure:${current.id}:${previous.id}`,
        securityId,
        category: 'structure:dilution-change',
        severity: riskScore >= 65 ? 'critical' : 'high',
        source: 'share-structure',
        message: `${current.symbol} share structure expanded: outstanding ${change.outstandingChangePct ?? 'n/a'}%, float ${change.floatChangePct ?? 'n/a'}%, authorized ${change.authorizedChangePct ?? 'n/a'}%.`,
        payload: { ...change, currentObservationId: current.id, previousObservationId: previous.id },
        observedAt: current.observedAt,
      }).onConflictDoNothing({ target: systemEvents.eventKey }).returning({ id: systemEvents.id });
      eventsCreated += result.length;
    }
  }

  return {
    observationsChecked: rows.length,
    securitiesCompared: [...recentBySecurity.values()].filter((rowsForSecurity) => rowsForSecurity.length >= 2).length,
    changes: changes.sort((a, b) => b.riskScore - a.riskScore),
    eventsCreated,
  };
}
