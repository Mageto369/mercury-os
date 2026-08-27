import { and, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { corporateActions, securities, systemEvents } from '@/lib/db/schema';

export interface StructuralRiskFlag {
  securityId: string;
  symbol: string;
  reasons: string[];
  maxRiskScore: number;
}

export interface RiskGatewayResult {
  flagged: StructuralRiskFlag[];
  corporateActionsChecked: number;
  dilutionEventsChecked: number;
}

export async function runRiskGatewayWorkflow(): Promise<RiskGatewayResult> {
  const db = getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const cutoffDays = Math.max(1, Math.min(180, Number(process.env.RISK_LOOKBACK_DAYS ?? 45)));
  const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);

  const actionRows = await db
    .select({ securityId: corporateActions.securityId, symbol: securities.symbol, type: corporateActions.type, riskScore: corporateActions.riskScore })
    .from(corporateActions)
    .innerJoin(securities, eq(corporateActions.securityId, securities.id))
    .where(and(gte(corporateActions.riskScore, 55), gte(corporateActions.observedAt, cutoff)))
    .limit(250);

  const dilutionRows = await db
    .select({ securityId: systemEvents.securityId, symbol: securities.symbol, message: systemEvents.message, category: systemEvents.category })
    .from(systemEvents)
    .innerJoin(securities, eq(systemEvents.securityId, securities.id))
    .where(and(inArray(systemEvents.category, ['filing:dilution', 'structure:dilution-change']), gte(systemEvents.observedAt, cutoff)))
    .limit(500);

  const flags = new Map<string, StructuralRiskFlag>();

  for (const row of actionRows) {
    const current = flags.get(row.securityId) ?? { securityId: row.securityId, symbol: row.symbol, reasons: [], maxRiskScore: 0 };
    current.reasons.push(`${row.type} corporate action risk ${row.riskScore}`);
    current.maxRiskScore = Math.max(current.maxRiskScore, row.riskScore);
    flags.set(row.securityId, current);
  }

  for (const row of dilutionRows) {
    if (!row.securityId) continue;
    const current = flags.get(row.securityId) ?? { securityId: row.securityId, symbol: row.symbol, reasons: [], maxRiskScore: 0 };
    current.reasons.push(row.message);
    current.maxRiskScore = Math.max(current.maxRiskScore, row.category === 'structure:dilution-change' ? 70 : 65);
    flags.set(row.securityId, current);
  }

  return {
    flagged: [...flags.values()].sort((a, b) => b.maxRiskScore - a.maxRiskScore),
    corporateActionsChecked: actionRows.length,
    dilutionEventsChecked: dilutionRows.length,
  };
}
