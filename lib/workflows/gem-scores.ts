export interface GemScoreInput {
  liquidityScore: number;
  marketOutlook: number;
  catalystScore: number | null;
  structureScore: number | null;
  attentionGapScore: number | null;
  promotionRisk: number;
  hasRiskFlag: boolean;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Missing catalyst, structure, and attention contribute nothing.
 * They are not filled with a neutral 50 or a clean 95, and the remaining
 * weights are not scaled up, so liquidity alone cannot clear a gem threshold.
 */
export function scoreGemCandidate(input: GemScoreInput) {
  const parts: Array<{ score: number; weight: number }> = [
    { score: input.liquidityScore, weight: 0.28 },
    { score: input.marketOutlook, weight: 0.08 },
  ];
  if (input.catalystScore !== null && Number.isFinite(input.catalystScore)) parts.push({ score: input.catalystScore, weight: 0.24 });
  if (input.structureScore !== null && Number.isFinite(input.structureScore)) parts.push({ score: input.structureScore, weight: 0.24 });
  if (input.attentionGapScore !== null && Number.isFinite(input.attentionGapScore)) parts.push({ score: input.attentionGapScore, weight: 0.16 });
  const gemScore = clamp(parts.reduce((sum, part) => sum + part.score * part.weight, 0));

  const reasons: string[] = [];
  if (input.liquidityScore >= 75) reasons.push('strong tradable liquidity');
  if (input.catalystScore !== null && input.catalystScore >= 68) reasons.push('recent regulatory catalyst support');
  if (input.structureScore !== null && input.structureScore >= 85 && !input.hasRiskFlag) reasons.push('clean structural-risk profile');
  if (input.attentionGapScore !== null && input.attentionGapScore >= 75) reasons.push('low-crowding attention gap');
  if (input.promotionRisk >= 55) reasons.push('promotion pressure reduces quality');
  if (input.hasRiskFlag) reasons.push('structural warning present');
  return { gemScore, reasons };
}
