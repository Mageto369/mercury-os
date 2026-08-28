import { expect, test } from "@playwright/test";
import {
  ECONOMIC_PROOF_SAMPLE_FLOOR,
  MONTE_CARLO_MINIMUM_OBSERVATIONS,
  runBootstrapMonteCarlo,
} from "../../lib/research/monte-carlo";

test("Monte Carlo stays unavailable without live observations", () => {
  const result = runBootstrapMonteCarlo([]);
  expect(result.available).toBe(false);
  if (result.available) return;
  expect(result.reason).toBe("no_matured_live_returns");
  expect(result.simulations).toBe(0);
  expect(result.capitalExecutionEnabled).toBe(false);
});

test("Monte Carlo withholds percentiles below the sample floor", () => {
  const returns = Array.from(
    { length: MONTE_CARLO_MINIMUM_OBSERVATIONS - 1 },
    () => 1,
  );
  const result = runBootstrapMonteCarlo(returns);
  expect(result.available).toBe(false);
  if (result.available) return;
  expect(result.reason).toBe("insufficient_live_sample");
  expect(result.observationsNeeded).toBe(1);
  expect("medianReturnPct" in result).toBe(false);
});

test("Monte Carlo reports qualified percentiles at the minimum sample", () => {
  const returns = Array.from(
    { length: MONTE_CARLO_MINIMUM_OBSERVATIONS },
    () => 1,
  );
  const result = runBootstrapMonteCarlo(returns, {
    simulations: 100,
    tradesPerPath: 10,
    random: () => 0,
  });
  expect(result.available).toBe(true);
  if (!result.available) return;
  expect(result.evidenceStatus).toBe("minimum");
  expect(result.medianReturnPct).toBeCloseTo((1.01 ** 10 - 1) * 100, 8);
  expect(result.meetsEconomicProofSampleFloor).toBe(false);
  expect(result.capitalExecutionEnabled).toBe(false);
});

test("meeting the economic-proof sample floor does not grant capital authority", () => {
  const returns = Array.from(
    { length: ECONOMIC_PROOF_SAMPLE_FLOOR },
    () => 0.1,
  );
  const result = runBootstrapMonteCarlo(returns, {
    simulations: 100,
    tradesPerPath: 1,
    random: () => 0,
  });
  expect(result.available).toBe(true);
  expect(result.meetsEconomicProofSampleFloor).toBe(true);
  expect(result.evidenceStatus).toBe("strong");
  expect(result.capitalExecutionEnabled).toBe(false);
});
