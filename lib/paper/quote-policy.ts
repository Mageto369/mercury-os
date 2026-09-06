export type PaperPricingMode = "auto" | "live" | "reference";

export interface PaperQuoteSnapshot {
  price: unknown;
  bid?: unknown;
  ask?: unknown;
  observed_at: Date | string;
  source?: unknown;
  payload?: unknown;
}

export interface PaperQuoteDecision {
  accepted: boolean;
  requestedPricingMode: PaperPricingMode;
  pricingMode: "live" | "reference" | null;
  source: string | null;
  evidenceClass: string | null;
  observedAt: string | null;
  ageMinutes: number | null;
  maxAgeMinutes: number;
  reason: string | null;
}

export const LIVE_QUOTE_MAX_AGE_MINUTES = 5;
export const REFERENCE_QUOTE_MAX_AGE_MINUTES = 7 * 24 * 60;

function payloadObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  }
  return {};
}

function describe(snapshot: PaperQuoteSnapshot, mode: PaperPricingMode, now: Date): PaperQuoteDecision {
  const payload = payloadObject(snapshot.payload);
  const source = String(snapshot.source ?? payload.source ?? "unknown");
  const evidenceClass = typeof payload.evidenceClass === "string" ? payload.evidenceClass : null;
  const observed = snapshot.observed_at instanceof Date ? snapshot.observed_at : new Date(snapshot.observed_at);
  const validTimestamp = Number.isFinite(observed.getTime());
  const ageMinutes = validTimestamp ? (now.getTime() - observed.getTime()) / 60_000 : null;
  const isLive = evidenceClass === "live" && payload.livePull === true && source !== "nasdaq-delayed";
  const maxAgeMinutes = isLive ? LIVE_QUOTE_MAX_AGE_MINUTES : REFERENCE_QUOTE_MAX_AGE_MINUTES;
  const validPrice = Number.isFinite(Number(snapshot.price)) && Number(snapshot.price) > 0;
  let reason: string | null = null;
  if (!validPrice) reason = "quote_price_invalid";
  else if (ageMinutes == null || ageMinutes < -5) reason = "quote_timestamp_invalid";
  else if (ageMinutes > maxAgeMinutes) reason = isLive ? "live_quote_stale" : "reference_quote_stale";
  else if (mode === "live" && !isLive) reason = "live_quote_required";
  else if (mode === "reference" && isLive) reason = "reference_quote_required";
  return {
    accepted: reason == null,
    requestedPricingMode: mode,
    pricingMode: reason == null ? (isLive ? "live" : "reference") : null,
    source,
    evidenceClass,
    observedAt: validTimestamp ? observed.toISOString() : null,
    ageMinutes: ageMinutes == null ? null : Number(ageMinutes.toFixed(2)),
    maxAgeMinutes,
    reason,
  };
}

export function selectPaperQuote(
  snapshots: PaperQuoteSnapshot[],
  mode: PaperPricingMode,
  now: Date = new Date(),
): { snapshot: PaperQuoteSnapshot | null; decision: PaperQuoteDecision } {
  const ordered = [...snapshots].sort((a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime());
  const modes: PaperPricingMode[] = mode === "auto" ? ["live", "reference"] : [mode];
  for (const candidateMode of modes) {
    for (const snapshot of ordered) {
      const decision = describe(snapshot, candidateMode, now);
      if (decision.accepted) return { snapshot, decision: { ...decision, requestedPricingMode: mode } };
    }
  }
  const latest = ordered[0];
  const decision = latest
    ? describe(latest, mode, now)
    : { accepted:false, requestedPricingMode:mode, pricingMode:null, source:null, evidenceClass:null, observedAt:null, ageMinutes:null, maxAgeMinutes:mode === "live" ? LIVE_QUOTE_MAX_AGE_MINUTES : REFERENCE_QUOTE_MAX_AGE_MINUTES, reason:"market_snapshot_required" } satisfies PaperQuoteDecision;
  return { snapshot: null, decision };
}
