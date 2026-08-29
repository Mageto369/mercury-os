import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { scoreOpportunity } from '@/lib/alpha/scoring';
import { routeOperationalAlert } from '@/lib/alerts/router';
import { getDb } from '@/lib/db';
import { decisionLogs, opportunities, securities } from '@/lib/db/schema';
import type { OpportunityInput, OpportunityState } from '@/lib/domain/types';
import { runGemDiscoveryWorkflow } from '@/lib/workflows/gem-discovery';
import { runLiquidityPulseWorkflow } from '@/lib/workflows/liquidity-pulse';
import { runRiskGatewayWorkflow } from '@/lib/workflows/risk-gateway';
import { runSocialRadarWorkflow } from '@/lib/workflows/social-radar';

export interface LiveOpportunity {
  symbol: string;
  opportunityId: string;
  decision: ReturnType<typeof scoreOpportunity>;
  state: OpportunityState;
}

export interface OpportunityEngineResult {
  generated: LiveOpportunity[];
  candidatesChecked: number;
  blocked: number;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function inferState(wave: number, socialVelocity: number, crowding: number): OpportunityState {
  if (crowding >= 90 && wave >= 85) return 'EUPHORIA';
  if (crowding >= 78 && wave < 80) return 'DISTRIBUTION';
  if (wave >= 90) return 'ACCELERATION';
  if (wave >= 78) return 'BREAKOUT';
  if (wave >= 62 || socialVelocity >= 55) return 'IGNITION';
  if (wave >= 45) return 'ACCUMULATION';
  return 'DORMANT';
}

export async function runOpportunityEngineWorkflow(): Promise<OpportunityEngineResult> {
  const db = getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const [gems, liquidity, social, risk] = await Promise.all([
    runGemDiscoveryWorkflow(),
    runLiquidityPulseWorkflow(),
    runSocialRadarWorkflow(),
    runRiskGatewayWorkflow(),
  ]);

  const symbols = gems.candidates.map((candidate) => candidate.symbol);
  if (!symbols.length) return { generated: [], candidatesChecked: 0, blocked: 0 };

  const tracked = await db
    .select({ id: securities.id, symbol: securities.symbol, market: securities.market })
    .from(securities)
    .where(inArray(securities.symbol, symbols));

  const securityBySymbol = new Map(tracked.map((security) => [security.symbol, security]));
  const liquidityBySymbol = new Map(liquidity.signals.map((signal) => [signal.symbol, signal]));
  const socialBySymbol = new Map(social.trends.map((trend) => [trend.symbol, trend]));
  const riskBySymbol = new Map(risk.flagged.map((flag) => [flag.symbol, flag]));

  const generated: LiveOpportunity[] = [];

  for (const candidate of gems.candidates) {
    const security = securityBySymbol.get(candidate.symbol);
    const liquiditySignal = liquidityBySymbol.get(candidate.symbol);
    if (!security || !liquiditySignal) continue;

    const socialSignal = socialBySymbol.get(candidate.symbol);
    const riskFlag = riskBySymbol.get(candidate.symbol);
    const socialVelocity = socialSignal?.velocity ?? 0;
    const crowding = socialSignal?.crowding ?? 0;
    const promotionRisk = socialSignal?.promotionRisk ?? 0;
    const rvol = liquiditySignal.rvol ?? 0;
    const floatRotation = liquiditySignal.floatRotation ?? 0;
    const wave = clamp(rvol * 19 + floatRotation * 12 + socialVelocity * 0.42 + 18);
    const peakRisk = clamp(crowding * 0.48 + socialVelocity * 0.24 + Math.max(0, floatRotation - 2) * 9);
    const trapRisk = clamp((riskFlag?.maxRiskScore ?? 0) * 0.72 + promotionRisk * 0.45);
    const reverseSplitRisk = riskFlag?.reasons.some((reason) => reason.includes('reverse_split')) ? Math.max(60, riskFlag.maxRiskScore) : 0;
    const dilutionRisk = riskFlag ? Math.min(100, riskFlag.maxRiskScore) : 0;
    const confidence = clamp(55 + (liquiditySignal.rvol !== null ? 10 : 0) + (socialSignal ? 10 : 0) + (candidate.catalystScore !== 50 ? 10 : 0) + (candidate.structureScore >= 80 ? 10 : 0));
    const state = inferState(wave, socialVelocity, crowding);

    const input: OpportunityInput = {
      symbol: candidate.symbol,
      market: security.market as OpportunityInput['market'],
      price: liquiditySignal.price,
      marketCapUsd: 0,
      floatShares: 0,
      avgDollarVolume20d: 0,
      gem: candidate.gemScore,
      wave,
      catalyst: candidate.catalystScore,
      social: clamp(socialVelocity * 0.7 + (socialSignal?.crossSourceConfirmation ?? 0) * 0.3),
      liquidity: liquiditySignal.liquidityScore,
      marketOutlook: candidate.marketOutlook,
      reverseSplitRisk,
      dilutionRisk,
      promotionRisk,
      trapRisk,
      peakRisk,
      confidence,
      state,
    };

    const decision = scoreOpportunity(input);
    const opportunityId = randomUUID();
    const modelVersion = 'mercury-live-shadow-v1';

    await db.insert(opportunities).values({
      id: opportunityId,
      securityId: security.id,
      state,
      alpha: decision.alpha,
      gem: input.gem,
      wave: input.wave,
      asymmetry: decision.asymmetry,
      catalyst: input.catalyst,
      social: input.social,
      liquidity: input.liquidity,
      trapRisk: input.trapRisk,
      peakRisk: input.peakRisk,
      confidence: input.confidence,
      aggression: decision.aggression,
      action: decision.action,
      hardBlocked: decision.hardBlocked,
      reasons: decision.reasons,
      modelVersion,
      observedAt: new Date(),
    });

    await db.insert(decisionLogs).values({
      id: randomUUID(),
      securityId: security.id,
      opportunityId,
      decision: decision.action,
      actor: 'autonomous-opportunity-engine',
      modelVersion,
      inputs: input,
      rationale: { reasons: decision.reasons, alpha: decision.alpha, asymmetry: decision.asymmetry },
    });

    if (input.confidence >= 80 && !decision.hardBlocked) {
      await routeOperationalAlert({
        eventKey: `opportunity:${opportunityId}`,
        category: 'opportunity',
        severity: 'high',
        title: `${candidate.symbol} high-confidence shadow opportunity`,
        message: `${candidate.symbol} scored ${input.confidence}% confidence with action ${decision.action}.`,
        payload: {
          confidence: input.confidence,
          symbol: candidate.symbol,
          opportunityId,
          action: decision.action,
          alpha: decision.alpha,
          asymmetry: decision.asymmetry,
        },
      });
    }

    generated.push({ symbol: candidate.symbol, opportunityId, decision, state });
  }

  return {
    generated: generated.sort((a, b) => b.decision.asymmetry - a.decision.asymmetry),
    candidatesChecked: gems.candidates.length,
    blocked: generated.filter((item) => item.decision.hardBlocked).length,
  };
}
