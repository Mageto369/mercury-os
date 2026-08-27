export interface ExecutionSimulationInput {
  notional: number;
  price: number;
  dollarVolume: number;
  spreadBps: number;
  rvol?: number;
  floatRotation?: number;
  volatilityScore?: number;
}

export interface ExecutionSimulationResult {
  participationRatePct: number;
  estimatedOneWayCostBps: number;
  estimatedRoundTripCostBps: number;
  estimatedRoundTripCostPct: number;
  estimatedFillProbabilityPct: number;
  estimatedCapacityNotional: number;
  capacityExceeded: boolean;
  discontinuityRisk: 'low' | 'moderate' | 'high' | 'extreme';
}

export function simulateExecution(input: ExecutionSimulationInput): ExecutionSimulationResult {
  const notional = Math.max(0, input.notional);
  const dollarVolume = Math.max(1, input.dollarVolume);
  const spreadBps = Math.max(0, input.spreadBps);
  const rvol = Math.max(0, input.rvol ?? 1);
  const rotation = Math.max(0, input.floatRotation ?? 0);
  const volatility = Math.max(0, Math.min(100, input.volatilityScore ?? Math.min(100, rvol * 8 + rotation * 12)));
  const participation = notional / dollarVolume;
  const maxParticipation = volatility >= 80 ? 0.0025 : volatility >= 60 ? 0.005 : 0.01;
  const capacity = dollarVolume * maxParticipation;

  const spreadComponent = spreadBps / 2;
  const impactComponent = 12 * Math.sqrt(Math.max(0, participation * 100));
  const volatilityComponent = volatility * 0.08;
  const oneWayCostBps = spreadComponent + impactComponent + volatilityComponent;
  const fillPenalty = Math.min(80, participation * 4000 + spreadBps * 0.04 + volatility * 0.2);
  const fillProbability = Math.max(5, 100 - fillPenalty);

  const discontinuityScore = volatility * 0.55 + Math.min(100, rvol * 8) * 0.2 + Math.min(100, rotation * 25) * 0.25;
  const discontinuityRisk = discontinuityScore >= 80 ? 'extreme' : discontinuityScore >= 60 ? 'high' : discontinuityScore >= 35 ? 'moderate' : 'low';

  return {
    participationRatePct: Number((participation * 100).toFixed(4)),
    estimatedOneWayCostBps: Number(oneWayCostBps.toFixed(2)),
    estimatedRoundTripCostBps: Number((oneWayCostBps * 2).toFixed(2)),
    estimatedRoundTripCostPct: Number((oneWayCostBps * 2 / 100).toFixed(4)),
    estimatedFillProbabilityPct: Number(fillProbability.toFixed(2)),
    estimatedCapacityNotional: Number(capacity.toFixed(2)),
    capacityExceeded: notional > capacity,
    discontinuityRisk,
  };
}
