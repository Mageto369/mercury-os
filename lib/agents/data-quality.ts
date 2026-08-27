import { desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { marketSnapshots, socialMentions, shareStructures, filings } from '@/lib/db/schema';

export interface DataQualityResult {
  status: 'healthy' | 'degraded' | 'offline';
  databaseConfigured: boolean;
  staleDomains: string[];
  detail: Record<string, string | null>;
}

export async function runDataQualityAgent(): Promise<DataQualityResult> {
  const db = getDb();
  if (!db) {
    return {
      status: 'offline',
      databaseConfigured: false,
      staleDomains: ['database'],
      detail: { market: null, social: null, structure: null, filings: null },
    };
  }

  const [market, social, structure, filing] = await Promise.all([
    db.select({ observedAt: marketSnapshots.observedAt }).from(marketSnapshots).orderBy(desc(marketSnapshots.observedAt)).limit(1),
    db.select({ observedAt: socialMentions.observedAt }).from(socialMentions).orderBy(desc(socialMentions.observedAt)).limit(1),
    db.select({ observedAt: shareStructures.observedAt }).from(shareStructures).orderBy(desc(shareStructures.observedAt)).limit(1),
    db.select({ filedAt: filings.filedAt }).from(filings).orderBy(desc(filings.filedAt)).limit(1),
  ]);

  const now = Date.now();
  const marketMaxMinutes = Math.max(1, Number(process.env.MARKET_STALE_MINUTES ?? 5));
  const socialMaxMinutes = Math.max(2, Number(process.env.SOCIAL_STALE_MINUTES ?? 30));
  const structureMaxHours = Math.max(1, Number(process.env.STRUCTURE_STALE_HOURS ?? 72));
  const filingMaxHours = Math.max(1, Number(process.env.FILING_STALE_HOURS ?? 72));

  const staleDomains: string[] = [];
  const marketAt = market[0]?.observedAt ?? null;
  const socialAt = social[0]?.observedAt ?? null;
  const structureAt = structure[0]?.observedAt ?? null;
  const filingAt = filing[0]?.filedAt ?? null;

  if (!marketAt || now - marketAt.getTime() > marketMaxMinutes * 60_000) staleDomains.push('market');
  if (!socialAt || now - socialAt.getTime() > socialMaxMinutes * 60_000) staleDomains.push('social');
  if (!structureAt || now - structureAt.getTime() > structureMaxHours * 3_600_000) staleDomains.push('structure');
  if (!filingAt || now - filingAt.getTime() > filingMaxHours * 3_600_000) staleDomains.push('filings');

  return {
    status: staleDomains.length ? 'degraded' : 'healthy',
    databaseConfigured: true,
    staleDomains,
    detail: {
      market: marketAt?.toISOString() ?? null,
      social: socialAt?.toISOString() ?? null,
      structure: structureAt?.toISOString() ?? null,
      filings: filingAt?.toISOString() ?? null,
    },
  };
}
