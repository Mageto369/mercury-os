import { classifyDomainFreshness, usableTimestamp } from '@/lib/agents/freshness';
import { getDb, getSql } from '@/lib/db';

export interface DataQualityResult {
  status: 'healthy' | 'degraded' | 'offline';
  databaseConfigured: boolean;
  staleDomains: string[];
  absentDomains: string[];
  detail: Record<string, string | null>;
}

export async function runDataQualityAgent(): Promise<DataQualityResult> {
  const db = getDb();
  if (!db) {
    return {
      status: 'offline',
      databaseConfigured: false,
      staleDomains: ['database'],
      absentDomains: [],
      detail: { market: null, social: null, structure: null, filings: null },
    };
  }

  const sql = getSql();
  if (!sql) {
    return {
      status: 'offline',
      databaseConfigured: false,
      staleDomains: ['database'],
      absentDomains: [],
      detail: { market: null, social: null, structure: null, filings: null },
    };
  }
  const [marketFreshness, socialRows, structureRows, filingRows] = await Promise.all([
    sql<{ live_at: Date | null; reference_at: Date | null }[]>`
      SELECT
        max(observed_at) FILTER (WHERE coalesce(payload->>'evidenceClass', 'live') <> 'delayed-reference') AS live_at,
        max(coalesce(nullif(payload->>'ingestedAt', '')::timestamptz, observed_at)) FILTER (WHERE payload->>'evidenceClass' = 'delayed-reference') AS reference_at
      FROM market_snapshots
    `,
    sql<{ count: number; observed_at: Date | null }[]>`SELECT count(*)::int AS count, max(observed_at) AS observed_at FROM social_mentions`,
    sql<{ count: number; observed_at: Date | null; ingested_at: Date | null }[]>`
      SELECT
        (SELECT count(*)::int FROM share_structures) AS count,
        (SELECT max(observed_at) FROM share_structures WHERE observed_at <= now()) AS observed_at,
        (SELECT max(observed_at) FROM system_events WHERE category = 'structure:ingest' AND observed_at <= now()) AS ingested_at
    `,
    sql<{ count: number; filed_at: Date | null; ingested_at: Date | null }[]>`
      SELECT
        (SELECT count(*)::int FROM filings) AS count,
        (SELECT max(filed_at) FROM filings) AS filed_at,
        (SELECT max(observed_at) FROM system_events WHERE category LIKE 'filing:%') AS ingested_at
    `,
  ]);

  const now = Date.now();
  const marketMaxMinutes = Math.max(1, Number(process.env.MARKET_STALE_MINUTES ?? 5));
  const referenceMaxMinutes = Math.max(marketMaxMinutes, Number(process.env.REFERENCE_STALE_MINUTES ?? 36 * 60));
  const socialMaxMinutes = Math.max(2, Number(process.env.SOCIAL_STALE_MINUTES ?? 30));
  const structureMaxHours = Math.max(1, Number(process.env.STRUCTURE_STALE_HOURS ?? 72));
  const filingMaxHours = Math.max(1, Number(process.env.FILING_STALE_HOURS ?? 72));

  const staleDomains: string[] = [];
  const absentDomains: string[] = [];
  const liveAt = usableTimestamp(marketFreshness[0]?.live_at, now);
  const referenceAt = usableTimestamp(marketFreshness[0]?.reference_at, now);
  const liveFresh = Boolean(liveAt && now - liveAt.getTime() <= marketMaxMinutes * 60_000);
  const referenceFresh = Boolean(referenceAt && now - referenceAt.getTime() <= referenceMaxMinutes * 60_000);
  const marketAt = liveFresh ? liveAt : referenceFresh ? referenceAt : liveAt ?? referenceAt;
  const socialCount = Number(socialRows[0]?.count ?? 0);
  const social = classifyDomainFreshness({
    count: socialCount,
    observedAt: socialRows[0]?.observed_at,
    now,
    maxAgeMs: socialMaxMinutes * 60_000,
  });
  const structure = classifyDomainFreshness({
    count: Number(structureRows[0]?.count ?? 0),
    observedAt: structureRows[0]?.observed_at,
    ingestedAt: structureRows[0]?.ingested_at,
    now,
    maxAgeMs: structureMaxHours * 3_600_000,
  });
  const filings = classifyDomainFreshness({
    count: Number(filingRows[0]?.count ?? 0),
    observedAt: filingRows[0]?.filed_at,
    ingestedAt: filingRows[0]?.ingested_at,
    now,
    maxAgeMs: filingMaxHours * 3_600_000,
  });

  if (!liveFresh && !referenceFresh) staleDomains.push('market');
  if (social.status === 'absent') absentDomains.push('social');
  else if (social.status === 'stale') staleDomains.push('social');
  if (structure.status === 'absent') absentDomains.push('structure');
  else if (structure.status === 'stale') staleDomains.push('structure');
  if (filings.status === 'absent') absentDomains.push('filings');
  else if (filings.status === 'stale') staleDomains.push('filings');

  return {
    status: staleDomains.length ? 'degraded' : 'healthy',
    databaseConfigured: true,
    staleDomains,
    absentDomains,
    detail: {
      market: marketAt?.toISOString() ?? null,
      marketEvidence: liveFresh ? 'live' : referenceFresh ? 'delayed-reference' : null,
      social: social.status === 'absent' ? 'absent' : social.clock?.toISOString() ?? null,
      structure: structure.clock?.toISOString() ?? null,
      structureClock: structure.clockSource,
      filings: filings.clock?.toISOString() ?? null,
      filingsClock: filings.clockSource,
    },
  };
}
