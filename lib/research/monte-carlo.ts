export const MONTE_CARLO_MINIMUM_OBSERVATIONS = 100;
export const ECONOMIC_PROOF_SAMPLE_FLOOR = 1_000;

export interface MonteCarloOptions {
  simulations?: number;
  tradesPerPath?: number;
  random?: () => number;
}

export function runBootstrapMonteCarlo(
  returns: number[],
  options: MonteCarloOptions = {},
) {
  const observations = returns.filter(Number.isFinite);
  const sourceObservations = observations.length;
  const common = {
    sourceObservations,
    minimumSourceObservations: MONTE_CARLO_MINIMUM_OBSERVATIONS,
    economicProofSampleFloor: ECONOMIC_PROOF_SAMPLE_FLOOR,
    meetsEconomicProofSampleFloor:
      sourceObservations >= ECONOMIC_PROOF_SAMPLE_FLOOR,
    capitalExecutionEnabled: false as const,
  };

  if (sourceObservations === 0) {
    return {
      ...common,
      available: false as const,
      evidenceStatus: "unavailable" as const,
      reason: "no_matured_live_returns" as const,
      observationsNeeded: MONTE_CARLO_MINIMUM_OBSERVATIONS,
      simulations: 0,
      limitations: ["No matured live 60-minute returns exist."],
    };
  }

  if (sourceObservations < MONTE_CARLO_MINIMUM_OBSERVATIONS) {
    return {
      ...common,
      available: false as const,
      evidenceStatus: "insufficient" as const,
      reason: "insufficient_live_sample" as const,
      observationsNeeded: MONTE_CARLO_MINIMUM_OBSERVATIONS - sourceObservations,
      simulations: 0,
      limitations: [
        `At least ${MONTE_CARLO_MINIMUM_OBSERVATIONS} matured live returns are required before percentile estimates are reported.`,
      ],
    };
  }

  const simulations = Math.max(100, Math.floor(options.simulations ?? 2_000));
  const tradesPerPath = Math.max(1, Math.floor(options.tradesPerPath ?? 100));
  const random = options.random ?? Math.random;
  const paths: number[] = [];
  const drawdowns: number[] = [];
  let ruin = 0;

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    let equity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    for (let trade = 0; trade < tradesPerPath; trade += 1) {
      const index = Math.min(
        sourceObservations - 1,
        Math.floor(random() * sourceObservations),
      );
      const sampledReturn = observations[index] / 100;
      equity *= Math.max(0.01, 1 + sampledReturn);
      peak = Math.max(peak, equity);
      maxDrawdown = Math.min(maxDrawdown, (equity - peak) / peak);
    }
    paths.push(equity - 1);
    drawdowns.push(maxDrawdown);
    if (equity <= 0.5) ruin += 1;
  }

  paths.sort((left, right) => left - right);
  drawdowns.sort((left, right) => left - right);
  const quantile = (values: number[], percentile: number) => {
    const index = Math.min(
      values.length - 1,
      Math.max(0, Math.floor((values.length - 1) * percentile)),
    );
    return values[index] ?? 0;
  };
  const evidenceStatus =
    sourceObservations >= ECONOMIC_PROOF_SAMPLE_FLOOR
      ? "strong"
      : sourceObservations >= 500
        ? "developing"
        : "minimum";

  return {
    ...common,
    available: true as const,
    evidenceStatus,
    method: "bootstrap_with_replacement" as const,
    simulations,
    tradesPerPath,
    observationsNeeded: Math.max(
      0,
      ECONOMIC_PROOF_SAMPLE_FLOOR - sourceObservations,
    ),
    medianReturnPct: quantile(paths, 0.5) * 100,
    p05ReturnPct: quantile(paths, 0.05) * 100,
    p95ReturnPct: quantile(paths, 0.95) * 100,
    medianMaxDrawdownPct: quantile(drawdowns, 0.5) * 100,
    p05MaxDrawdownPct: quantile(drawdowns, 0.05) * 100,
    ruinProbabilityPct: (ruin / simulations) * 100,
    limitations: [
      "Bootstrap paths assume observed returns are representative and resample observations independently.",
      sourceObservations < ECONOMIC_PROOF_SAMPLE_FLOOR
        ? `The ${ECONOMIC_PROOF_SAMPLE_FLOOR}-observation economic-proof sample floor has not been met.`
        : "Meeting the sample floor does not satisfy the remaining economic-proof gates.",
    ],
  };
}
