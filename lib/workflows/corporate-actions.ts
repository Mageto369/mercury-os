import { desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { corporateActions, securities } from '@/lib/db/schema';

export interface CorporateActionSignal {
  symbol: string;
  type: string;
  riskScore: number;
  effectiveDate: string | null;
  observedAt: string;
}

export interface CorporateActionWorkflowResult {
  actionsChecked: number;
  highRisk: CorporateActionSignal[];
}

export async function runCorporateActionsWorkflow(): Promise<CorporateActionWorkflowResult> {
  const db = getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const lookbackDays = Math.max(1, Math.min(180, Number(process.env.CORPORATE_ACTION_LOOKBACK_DAYS ?? 60)));
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      symbol: securities.symbol,
      type: corporateActions.type,
      riskScore: corporateActions.riskScore,
      effectiveDate: corporateActions.effectiveDate,
      observedAt: corporateActions.observedAt,
    })
    .from(corporateActions)
    .innerJoin(securities, eq(corporateActions.securityId, securities.id))
    .where(gte(corporateActions.observedAt, cutoff))
    .orderBy(desc(corporateActions.observedAt))
    .limit(500);

  const highRisk = rows
    .filter((row) => row.riskScore >= 55 || row.type.toLowerCase().includes('reverse_split'))
    .map((row) => ({
      symbol: row.symbol,
      type: row.type,
      riskScore: row.riskScore,
      effectiveDate: row.effectiveDate?.toISOString() ?? null,
      observedAt: row.observedAt.toISOString(),
    }))
    .sort((a, b) => b.riskScore - a.riskScore);

  return { actionsChecked: rows.length, highRisk };
}
