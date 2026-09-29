export type DerivedMarketRegime = 'RISK_ON' | 'SELECTIVE' | 'DEFENSIVE';
export type RegimeBasis = 'microstructure' | 'volume-breadth' | 'none';

export interface ResearchObservation {
  dollarVolume: number;
  spreadBps: number | null;
  rvol: number | null;
  floatRotation: number | null;
}

export interface ResearchOutlook {
  medianRvol: number | null;
  medianSpreadBps: number | null;
  avgFloatRotation: number | null;
  breadthProxy: number;
  outlookScore: number;
  regime: DerivedMarketRegime;
  basis: RegimeBasis;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return value;
}

export function scoreLiquidity(dollarVolume: number, spreadBps: number | null, rvol: number | null, floatRotation: number | null) {
  const parts: Array<{ score: number; weight: number }> = [
    { score: clamp(Math.log10(Math.max(1, dollarVolume)) * 15 - 30), weight: 0.4 },
  ];
  if (spreadBps !== null && Number.isFinite(spreadBps)) parts.push({ score: clamp(100 - spreadBps / 5), weight: 0.3 });
  if (rvol !== null && Number.isFinite(rvol)) parts.push({ score: clamp(35 + Math.min(65, rvol * 18)), weight: 0.2 });
  if (floatRotation !== null && Number.isFinite(floatRotation)) parts.push({ score: clamp(45 + Math.min(55, floatRotation * 12)), weight: 0.1 });
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  return clamp(parts.reduce((sum, part) => sum + part.score * part.weight, 0) / weight);
}

export function deriveResearchOutlook(rows: ResearchObservation[]): ResearchOutlook {
  if (!rows.length) {
    return {
      medianRvol: null,
      medianSpreadBps: null,
      avgFloatRotation: null,
      breadthProxy: 0,
      outlookScore: 0,
      regime: 'DEFENSIVE',
      basis: 'none',
    };
  }

  const rvolValues = rows.map((row) => row.rvol).filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const spreadValues = rows.map((row) => row.spreadBps).filter((value): value is number => value !== null && Number.isFinite(value));
  const rotationValues = rows.map((row) => row.floatRotation).filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const liquidRows = rows.filter((row) => row.dollarVolume >= 250_000 && (row.spreadBps === null || row.spreadBps <= 300));
  const breadthProxy = Number(((liquidRows.length / rows.length) * 100).toFixed(1));
  const medianRvol = median(rvolValues);
  const medianSpreadBps = median(spreadValues);
  const avgFloatRotation = rotationValues.length ? rotationValues.reduce((sum, value) => sum + value, 0) / rotationValues.length : null;

  const parts: Array<{ score: number; weight: number }> = [{ score: breadthProxy, weight: 0.35 }];
  if (medianRvol !== null) parts.push({ score: clamp(35 + medianRvol * 18), weight: 0.3 });
  if (medianSpreadBps !== null) parts.push({ score: clamp(100 - medianSpreadBps / 5), weight: 0.25 });
  if (avgFloatRotation !== null) parts.push({ score: clamp(45 + avgFloatRotation * 12), weight: 0.1 });
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  const outlookScore = clamp(parts.reduce((sum, part) => sum + part.score * part.weight, 0) / weight);
  const regime: DerivedMarketRegime = outlookScore >= 72 ? 'RISK_ON' : outlookScore >= 48 ? 'SELECTIVE' : 'DEFENSIVE';
  const basis: RegimeBasis = medianRvol !== null || medianSpreadBps !== null ? 'microstructure' : 'volume-breadth';

  return {
    medianRvol: medianRvol === null ? null : Number(medianRvol.toFixed(2)),
    medianSpreadBps: medianSpreadBps === null ? null : Math.round(medianSpreadBps),
    avgFloatRotation: avgFloatRotation === null ? null : Number(avgFloatRotation.toFixed(2)),
    breadthProxy,
    outlookScore,
    regime,
    basis,
  };
}
