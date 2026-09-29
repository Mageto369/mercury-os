export interface SetupFeatures {
  return5Pct: number;
  relativeVolume: number;
  extension20Pct: number;
  closeLocationPct: number;
  room: boolean;
  riseScore: number;
}

export interface AnalogObservation extends SetupFeatures {
  symbol: string;
  date: string;
  forward5Pct: number;
}

export interface RankCandidate {
  symbol: string;
  asOf: string;
  blocksRoom: boolean;
  socialHype: number | null;
  setup: SetupFeatures;
}

export interface DailyConsideration {
  rank: number | null;
  symbol: string;
  asOf: string;
  strength: number;
  room: boolean;
  projectedGainPct: number | null;
  projectedLowPct: number | null;
  projectedHighPct: number | null;
  analogs: number;
  eligible: boolean;
}

export interface DailyRank {
  horizonSessions: 5;
  model: "mercury-analog-rank-v1";
  picks: DailyConsideration[];
  considered: DailyConsideration[];
}

const MIN_ANALOGS = 8;
const MAX_ANALOGS = 24;
const MAX_PER_SYMBOL = 3;
const DISTANCE_CAP = 1.35;
const HYPE_FLOOR = 70;
const STRENGTH_FLOOR = 50;

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function distance(left: SetupFeatures, right: SetupFeatures) {
  const trend = (left.return5Pct - right.return5Pct) / 8;
  const participation = (left.relativeVolume - right.relativeVolume) / 1.5;
  const extension = (left.extension20Pct - right.extension20Pct) / 10;
  const hold = (left.closeLocationPct - right.closeLocationPct) / 25;
  const room = left.room === right.room ? 0 : 1;
  return Math.sqrt(trend ** 2 + participation ** 2 + extension ** 2 + hold ** 2 + room ** 2);
}

function percentile(sorted: number[], fraction: number) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return round2(sorted[index] ?? 0);
}

function median(sorted: number[]) {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return round2(sorted[mid] ?? 0);
  return round2((((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2));
}

function projectionScore(projectedGainPct: number | null) {
  if (projectedGainPct == null) return 35;
  return clamp(50 + projectedGainPct * 4);
}

function hypePoints(socialHype: number | null) {
  if (socialHype == null || socialHype < HYPE_FLOOR) return 0;
  return Math.min(12, (socialHype - HYPE_FLOOR) * 0.4);
}

function strengthOf(setup: SetupFeatures, projectedGainPct: number | null, socialHype: number | null) {
  return Math.round(clamp(
    setup.riseScore * 0.72
    + projectionScore(projectedGainPct) * 0.28
    + (setup.room ? 6 : 0)
    + hypePoints(socialHype),
  ));
}

function projectGain(candidate: RankCandidate, analogs: AnalogObservation[]) {
  const nearest = analogs
    .filter((analog) => !(analog.symbol === candidate.symbol && analog.date === candidate.asOf))
    .map((analog) => ({ symbol: analog.symbol, gain: analog.forward5Pct, distance: distance(candidate.setup, analog) }))
    .filter((analog) => analog.distance <= DISTANCE_CAP)
    .sort((left, right) => left.distance - right.distance || left.symbol.localeCompare(right.symbol));
  const used = new Map<string, number>();
  const chosen: number[] = [];
  for (const analog of nearest) {
    const count = used.get(analog.symbol) ?? 0;
    if (count >= MAX_PER_SYMBOL) continue;
    used.set(analog.symbol, count + 1);
    chosen.push(analog.gain);
    if (chosen.length >= MAX_ANALOGS) break;
  }
  if (chosen.length < MIN_ANALOGS) {
    return { projectedGainPct: null, projectedLowPct: null, projectedHighPct: null, analogs: chosen.length };
  }
  const gains = [...chosen].sort((left, right) => left - right);
  return {
    projectedGainPct: median(gains),
    projectedLowPct: percentile(gains, 0.25),
    projectedHighPct: percentile(gains, 0.75),
    analogs: gains.length,
  };
}

function finiteSetup(setup: SetupFeatures) {
  return [setup.return5Pct, setup.relativeVolume, setup.extension20Pct, setup.closeLocationPct, setup.riseScore]
    .every((value) => Number.isFinite(value));
}

/** Rank the strongest names to consider. Projected gain is the median 5-session result of similar past sessions. */
export function rankDailyConsiderations(candidates: RankCandidate[], analogs: AnalogObservation[], limit = 10): DailyRank {
  const cap = Math.max(1, Math.min(10, limit));
  const scored = candidates.filter((candidate) => finiteSetup(candidate.setup)).map((candidate) => {
    const projection = projectGain(candidate, analogs);
    return {
      rank: null as number | null,
      symbol: candidate.symbol,
      asOf: candidate.asOf,
      strength: strengthOf(candidate.setup, projection.projectedGainPct, candidate.socialHype),
      room: candidate.setup.room && !candidate.blocksRoom,
      projectedGainPct: projection.projectedGainPct,
      projectedLowPct: projection.projectedLowPct,
      projectedHighPct: projection.projectedHighPct,
      analogs: projection.analogs,
      eligible: !candidate.blocksRoom
        && projection.projectedGainPct != null
        && (candidate.setup.riseScore >= STRENGTH_FLOOR || candidate.setup.room),
    };
  });
  const eligible = scored
    .filter((row) => row.eligible)
    .sort((left, right) => (right.projectedGainPct ?? Number.NEGATIVE_INFINITY) - (left.projectedGainPct ?? Number.NEGATIVE_INFINITY)
      || right.strength - left.strength
      || left.symbol.localeCompare(right.symbol));
  eligible.forEach((row, index) => {
    row.rank = index + 1;
  });
  return {
    horizonSessions: 5,
    model: "mercury-analog-rank-v1",
    considered: scored,
    picks: eligible.slice(0, cap),
  };
}
