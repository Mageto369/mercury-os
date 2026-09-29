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
    sql<{ count: number; observed_at: Date | null }[]>`SELECT count(*)::int AS count, max(observed_at) AS observed_at FROM share_structures`,
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
  const liveAt = marketFreshness[0]?.live_at ? new Date(marketFreshness[0].live_at) : null;
  const referenceAt = marketFreshness[0]?.reference_at ? new Date(marketFreshness[0].reference_at) : null;
  const liveFresh = Boolean(liveAt && now - liveAt.getTime() <= marketMaxMinutes * 60_000);
  const referenceFresh = Boolean(referenceAt && now - referenceAt.getTime() <= referenceMaxMinutes * 60_000);
  const marketAt = liveFresh ? liveAt : referenceFresh ? referenceAt : liveAt ?? referenceAt;
  const socialCount = Number(socialRows[0]?.count ?? 0);
  const socialAt = socialRows[0]?.observed_at ? new Date(socialRows[0].observed_at) : null;
  const structureCount = Number(structureRows[0]?.count ?? 0);
  const structureAt = structureRows[0]?.observed_at ? new Date(structureRows[0].observed_at) : null;
  const filingCount = Number(filingRows[0]?.count ?? 0);
  const filingFiledAt = filingRows[0]?.filed_at ? new Date(filingRows[0].filed_at) : null;
  const filingIngestedAt = filingRows[0]?.ingested_at ? new Date(filingRows[0].ingested_at) : null;
  const filingClock = filingIngestedAt ?? filingFiledAt;

  if (!liveFresh && !referenceFresh) staleDomains.push('market');
  if (socialCount === 0) absentDomains.push('social');
  else if (!socialAt || now - socialAt.getTime() > socialMaxMinutes * 60_000) staleDomains.push('social');
  if (structureCount === 0) absentDomains.push('structure');
  else if (structureAt && structureAt.getTime() <= now && now - structureAt.getTime() > structureMaxHours * 3_600_000) staleDomains.push('structure');
  if (filingCount === 0 && !filingIngestedAt) absentDomains.push('filings');
  else if (!filingClock || now - filingClock.getTime() > filingMaxHours * 3_600_000) staleDomains.push('filings');

  return {
    status: staleDomains.length ? 'degraded' : 'healthy',
    databaseConfigured: true,
    staleDomains,
    absentDomains,
    detail: {
      market: marketAt?.toISOString() ?? null,
      marketEvidence: liveFresh ? 'live' : referenceFresh ? 'delayed-reference' : null,
      social: socialCount === 0 ? 'absent' : socialAt?.toISOString() ?? null,
      structure: structureAt?.toISOString() ?? null,
      filings: filingClock?.toISOString() ?? null,
    },
  };
}
