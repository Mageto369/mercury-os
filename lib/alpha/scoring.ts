import type { OpportunityDecision, OpportunityInput } from "@/lib/domain/types";

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function scoreOpportunity(input: OpportunityInput): OpportunityDecision {
  const structuralSafety = 100 - Math.max(input.reverseSplitRisk, input.dilutionRisk, input.trapRisk);
  const attentionQuality = Math.max(0, input.social - input.promotionRisk * 0.55);
  const alpha = clamp(
    input.gem * 0.18 +
      input.wave * 0.2 +
      input.catalyst * 0.17 +
      attentionQuality * 0.1 +
      input.liquidity * 0.14 +
      input.marketOutlook * 0.08 +
      input.confidence * 0.08 +
      structuralSafety * 0.05,
  );

  const asymmetry = clamp(
    alpha * 0.62 +
      input.catalyst * 0.12 +
      input.liquidity * 0.1 +
      structuralSafety * 0.1 -
      input.peakRisk * 0.16,
  );

  const hardBlocked =
    input.reverseSplitRisk >= 55 ||
    input.dilutionRisk >= 65 ||
    input.trapRisk >= 65 ||
    input.liquidity <= 25;

  const reasons: string[] = [];
  if (input.gem >= 82) reasons.push("high pre-wave gem quality");
  if (input.wave >= 88) reasons.push("confirmed momentum wave");
  if (input.catalyst >= 80) reasons.push("strong catalyst support");
  if (input.liquidity >= 80) reasons.push("institutional-grade liquidity for this universe");
  if (input.marketOutlook >= 75) reasons.push("supportive market regime");
  if (input.promotionRisk >= 50) reasons.push("elevated promotion risk");
  if (input.peakRisk >= 75) reasons.push("late-cycle peak pressure");
  if (hardBlocked) reasons.push("hard risk gate triggered");

  let aggression: 0 | 1 | 2 | 3 | 4 | 5 = 1;
  if (hardBlocked) aggression = 0;
  else {
    if (asymmetry >= 78) aggression = 2;
    if (asymmetry >= 84 && input.confidence >= 82) aggression = 3;
    if (asymmetry >= 89 && input.wave >= 85 && input.liquidity >= 75) aggression = 4;
    if (asymmetry >= 93 && input.wave >= 92 && input.confidence >= 92 && input.peakRisk < 55) aggression = 5;
  }

  let action: OpportunityDecision["action"] = "WATCH";
  if (hardBlocked) action = "BLOCK";
  else if (input.peakRisk >= 90) action = "EXIT";
  else if (input.peakRisk >= 75) action = "REDUCE";
  else if (aggression >= 5) action = "PRESS";
  else if (aggression >= 4) action = "WAVE_ACTIVE";
  else if (input.gem >= 84 && ["DORMANT", "ACCUMULATION"].includes(input.state)) action = "GEM_WATCH";

  const riskMultipliers = [0, 0.25, 0.45, 0.7, 1, 1.25] as const;

  return {
    symbol: input.symbol,
    alpha,
    asymmetry,
    aggression,
    action,
    hardBlocked,
    reasons,
    suggestedRiskMultiplier: riskMultipliers[aggression],
  };
}
