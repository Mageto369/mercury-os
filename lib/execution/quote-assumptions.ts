/**
 * Delayed daily bars often have a price and dollar volume and nothing else.
 * Treating a missing spread as 0 prices the fill like a locked market.
 * 300 bps is the widest spread research still counts as liquid, so an
 * unobserved spread is charged at that ceiling and labeled assumed.
 * Relative volume of 1 would describe a normal session; 2 keeps an unknown
 * tape from being priced as calm. Missing float rotation adds no activity
 * premium, because a missing field is not evidence of a squeeze.
 */
export const ASSUMED_SPREAD_BPS = 300;
export const ASSUMED_RVOL = 2;

export type AssumptionSource = "observed" | "assumed";

export interface ExecutionQuoteAssumptions {
  spreadBps: number;
  rvol: number;
  floatRotation: number;
  spreadSource: AssumptionSource;
  rvolSource: AssumptionSource;
  floatRotationSource: AssumptionSource;
}

function finiteNonNegative(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

export function executionQuoteAssumptions(quote: {
  spreadBps?: unknown;
  spread_bps?: unknown;
  rvol?: unknown;
  floatRotation?: unknown;
  float_rotation?: unknown;
}): ExecutionQuoteAssumptions {
  const spread = finiteNonNegative(
    quote.spreadBps !== undefined ? quote.spreadBps : quote.spread_bps,
  );
  const rvol = finiteNonNegative(quote.rvol);
  const rotation = finiteNonNegative(
    quote.floatRotation !== undefined ? quote.floatRotation : quote.float_rotation,
  );
  return {
    spreadBps: spread ?? ASSUMED_SPREAD_BPS,
    rvol: rvol ?? ASSUMED_RVOL,
    floatRotation: rotation ?? 0,
    spreadSource: spread == null ? "assumed" : "observed",
    rvolSource: rvol == null ? "assumed" : "observed",
    floatRotationSource: rotation == null ? "assumed" : "observed",
  };
}
