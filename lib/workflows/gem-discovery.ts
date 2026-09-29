import { gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { systemEvents } from '@/lib/db/schema';
import { scoreGemCandidate } from '@/lib/workflows/gem-scores';
import { runLiquidityPulseWorkflow } from '@/lib/workflows/liquidity-pulse';
import { runMarketRegimeWorkflow } from '@/lib/workflows/market-regime';
import { runRiskGatewayWorkflow } from '@/lib/workflows/risk-gateway';
import { runSocialRadarWorkflow } from '@/lib/workflows/social-radar';

interface EventPayload {
  symbol?: string;
  catalystDelta?: number;
  riskDelta?: number;
}

export interface GemCandidate {
  symbol: string;
  gemScore: number;
  liquidityScore: number;
  catalystScore: number | null;
  structureScore: number | null;
  attentionGapScore: number | null;
  marketOutlook: number;
  socialVelocity: number;
  promotionRisk: number;
  reasons: string[];
}

export interface GemDiscoveryResult {
  candidates: GemCandidate[];
  universeSize: number;
  marketOutlook: number;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function runGemDiscoveryWorkflow(): Promise<GemDiscoveryResult> {
  const db = getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const [liquidity, social, risk, regime] = await Promise.all([
    runLiquidityPulseWorkflow(),
    runSocialRadarWorkflow(),
    runRiskGatewayWorkflow(),
    runMarketRegimeWorkflow(),
  ]);

  const catalystLookbackDays = Math.max(1, Math.min(90, Number(process.env.CATALYST_LOOKBACK_DAYS ?? 30)));
  const cutoff = new Date(Date.now() - catalystLookbackDays * 24 * 60 * 60 * 1000);
  const events = await db
    .select({ category: systemEvents.category, payload: systemEvents.payload })
    .from(systemEvents)
    .where(gte(systemEvents.observedAt, cutoff))
    .limit(3000);

  const catalystBySymbol = new Map<string, number>();
  for (const event of events) {
    const payload = (event.payload ?? {}) as EventPayload;
    if (!payload.symbol) continue;
    const delta = typeof payload.catalystDelta === 'number' ? payload.catalystDelta : 0;
    if (!delta) continue;
    catalystBySymbol.set(payload.symbol, (catalystBySymbol.get(payload.symbol) ?? 50) + delta);
  }

  const socialBySymbol = new Map(social.trends.map((trend) => [trend.symbol, trend]));
  const riskBySymbol = new Map(risk.flagged.map((flag) => [flag.symbol, flag]));
  const marketOutlook = regime.outlookScore;

  const candidates = liquidity.signals.map((liquiditySignal) => {
    const socialSignal = socialBySymbol.get(liquiditySignal.symbol);
    const riskFlag = riskBySymbol.get(liquiditySignal.symbol);
    const catalystScore = catalystBySymbol.has(liquiditySignal.symbol)
      ? clamp(catalystBySymbol.get(liquiditySignal.symbol) ?? 0)
      : null;
    const structureScore = riskFlag ? clamp(100 - riskFlag.maxRiskScore) : null;
    const socialVelocity = socialSignal?.velocity ?? 0;
    const promotionRisk = socialSignal?.promotionRisk ?? 0;
    const attentionGapScore = socialSignal
      ? clamp(100 - socialVelocity * 0.55 - socialSignal.crowding * 0.35 - promotionRisk * 0.25)
      : null;
    const scored = scoreGemCandidate({
      liquidityScore: liquiditySignal.liquidityScore,
      marketOutlook,
      catalystScore,
      structureScore,
      attentionGapScore,
      promotionRisk,
      hasRiskFlag: Boolean(riskFlag),
    });

    return {
      symbol: liquiditySignal.symbol,
      gemScore: scored.gemScore,
      liquidityScore: liquiditySignal.liquidityScore,
      catalystScore,
      structureScore,
      attentionGapScore,
      marketOutlook,
      socialVelocity,
      promotionRisk,
      reasons: scored.reasons,
    };
  }).sort((a, b) => b.gemScore - a.gemScore).slice(0, 100);

  return {
    candidates,
    universeSize: liquidity.signals.length,
    marketOutlook,
  };
}
