const FUTURE_SKEW_MS = 5 * 60_000;

export type DomainFreshness = "absent" | "fresh" | "stale";

export function usableTimestamp(value: Date | string | null | undefined, now: number): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time) || time > now + FUTURE_SKEW_MS) return null;
  return date;
}

/**
 * A future period end is not proof that a feed was checked.
 * Prefer an ingestion clock. When that is missing, a timestamp after now
 * cannot keep the domain fresh.
 */
export function classifyDomainFreshness(input: {
  count: number;
  observedAt?: Date | string | null;
  ingestedAt?: Date | string | null;
  now: number;
  maxAgeMs: number;
}): { status: DomainFreshness; clock: Date | null; clockSource: "ingest" | "observed" | null } {
  const ingested = usableTimestamp(input.ingestedAt, input.now);
  const observed = usableTimestamp(input.observedAt, input.now);
  const clock = ingested ?? observed;
  const clockSource = ingested ? "ingest" : observed ? "observed" : null;
  if (input.count <= 0 && !ingested) return { status: "absent", clock: null, clockSource: null };
  if (!clock) return { status: "stale", clock: null, clockSource: null };
  const age = input.now - clock.getTime();
  return { status: age > input.maxAgeMs ? "stale" : "fresh", clock, clockSource };
}
