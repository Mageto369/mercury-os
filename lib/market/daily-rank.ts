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
  adversePct?: number | null;
  favorablePct?: number | null;
  targetFirst?: boolean | null;
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
  winRatePct: number | null;
  expectancyPct: number | null;
  payoff: number | null;
  adversePct: number | null;
  favorablePct: number | null;
  targetFirstPct: number | null;
  edge: number | null;
  analogs: number;
  eligible: boolean;
}

export interface DailyRank {
  horizonSessions: 5;
  model: "mercury-analog-rank-v3";
  picks: DailyConsideration[];
  considered: DailyConsideration[];
}

const MIN_ANALOGS = 8;
const MAX_ANALOGS = 24;
const MAX_PER_SYMBOL = 3;
const DISTANCE_CAP = 1.35;
const HYPE_FLOOR = 70;
const STRENGTH_FLOOR = 50;

export interface RankKnobs {
  minAnalogs: number;
  distanceCap: number;
  strengthFloor: number;
  expectancyFloorPct: number;
  edgeFloor: number | null;
}

/** Matches the seeded champion card. Omitting knobs keeps this rank. */
export const DEFAULT_RANK_KNOBS: RankKnobs = {
  minAnalogs: MIN_ANALOGS,
  distanceCap: DISTANCE_CAP,
  strengthFloor: STRENGTH_FLOOR,
  expectancyFloorPct: 0,
  edgeFloor: null,
};

function resolveKnobs(knobs?: Partial<RankKnobs>): RankKnobs {
  return {
    minAnalogs: knobs?.minAnalogs ?? DEFAULT_RANK_KNOBS.minAnalogs,
    distanceCap: knobs?.distanceCap ?? DEFAULT_RANK_KNOBS.distanceCap,
    strengthFloor: knobs?.strengthFloor ?? DEFAULT_RANK_KNOBS.strengthFloor,
    expectancyFloorPct: knobs?.expectancyFloorPct ?? DEFAULT_RANK_KNOBS.expectancyFloorPct,
    edgeFloor: knobs?.edgeFloor === undefined ? DEFAULT_RANK_KNOBS.edgeFloor : knobs.edgeFloor,
  };
}

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

function targetFirstRate(flags: Array<boolean | null | undefined>) {
  const marked = flags.filter((flag) => flag === true || flag === false);
  if (!marked.length) return null;
  const hits = marked.filter((flag) => flag === true).length;
  return round2((hits / marked.length) * 100);
}

/** Average result divided by the typical adverse path. Null when that path did not go against the entry. */
function edgeRatio(expectancyPct: number | null, adversePct: number | null) {
  if (expectancyPct == null || adversePct == null) return null;
  if (!Number.isFinite(expectancyPct) || !Number.isFinite(adversePct) || !(adversePct < 0)) return null;
  return round2(expectancyPct / Math.abs(adversePct));
}

function projectGain(candidate: RankCandidate, analogs: AnalogObservation[], knobs: RankKnobs) {
  const nearest = analogs
    .filter((analog) => !(analog.symbol === candidate.symbol && analog.date === candidate.asOf))
    .map((analog) => ({
      symbol: analog.symbol,
      gain: analog.forward5Pct,
      adverse: analog.adversePct,
      favorable: analog.favorablePct,
      targetFirst: analog.targetFirst,
      distance: distance(candidate.setup, analog),
    }))
    .filter((analog) => analog.distance <= knobs.distanceCap)
    .sort((left, right) => left.distance - right.distance || left.symbol.localeCompare(right.symbol));
  const used = new Map<string, number>();
  const chosen: Array<{ gain: number; adverse: number | null | undefined; favorable: number | null | undefined; targetFirst: boolean | null | undefined }> = [];
  for (const analog of nearest) {
    const count = used.get(analog.symbol) ?? 0;
    if (count >= MAX_PER_SYMBOL) continue;
    used.set(analog.symbol, count + 1);
    chosen.push(analog);
    if (chosen.length >= MAX_ANALOGS) break;
  }
  if (chosen.length < knobs.minAnalogs) {
    return {
      projectedGainPct: null,
      projectedLowPct: null,
      projectedHighPct: null,
      winRatePct: null,
      expectancyPct: null,
      payoff: null,
      adversePct: null,
      favorablePct: null,
      targetFirstPct: null,
      edge: null,
      analogs: chosen.length,
    };
  }
  const gains = chosen.map((analog) => analog.gain).sort((left, right) => left - right);
  const adverse = chosen.map((analog) => analog.adverse).filter((value): value is number => value != null && Number.isFinite(value)).sort((left, right) => left - right);
  const favorable = chosen.map((analog) => analog.favorable).filter((value): value is number => value != null && Number.isFinite(value)).sort((left, right) => left - right);
  const wins = gains.filter((gain) => gain > 0);
  const losses = gains.filter((gain) => gain < 0);
  const averageWin = wins.length ? wins.reduce((sum, gain) => sum + gain, 0) / wins.length : null;
  const averageLoss = losses.length ? Math.abs(losses.reduce((sum, gain) => sum + gain, 0) / losses.length) : null;
  const expectancyPct = round2(gains.reduce((sum, gain) => sum + gain, 0) / gains.length);
  const adversePct = adverse.length ? median(adverse) : null;
  return {
    projectedGainPct: median(gains),
    projectedLowPct: percentile(gains, 0.25),
    projectedHighPct: percentile(gains, 0.75),
    winRatePct: round2((wins.length / gains.length) * 100),
    expectancyPct,
    payoff: averageWin != null && averageLoss != null && averageLoss > 0 ? round2(averageWin / averageLoss) : null,
    adversePct,
    favorablePct: favorable.length ? median(favorable) : null,
    targetFirstPct: targetFirstRate(chosen.map((analog) => analog.targetFirst)),
    edge: edgeRatio(expectancyPct, adversePct),
    analogs: gains.length,
  };
}

function finiteSetup(setup: SetupFeatures) {
  return [setup.return5Pct, setup.relativeVolume, setup.extension20Pct, setup.closeLocationPct, setup.riseScore]
    .every((value) => Number.isFinite(value));
}

/** Rank names to consider. A name stays off the list unless similar past sessions finished with a positive average. */
export function rankDailyConsiderations(candidates: RankCandidate[], analogs: AnalogObservation[], limit = 10, knobs?: Partial<RankKnobs>): DailyRank {
  const cap = Math.max(1, Math.min(10, limit));
  const resolved = resolveKnobs(knobs);
  const scored = candidates.filter((candidate) => finiteSetup(candidate.setup)).map((candidate) => {
    const projection = projectGain(candidate, analogs, resolved);
    return {
      rank: null as number | null,
      symbol: candidate.symbol,
      asOf: candidate.asOf,
      strength: strengthOf(candidate.setup, projection.projectedGainPct, candidate.socialHype),
      room: candidate.setup.room && !candidate.blocksRoom,
      projectedGainPct: projection.projectedGainPct,
      projectedLowPct: projection.projectedLowPct,
      projectedHighPct: projection.projectedHighPct,
      winRatePct: projection.winRatePct,
      expectancyPct: projection.expectancyPct,
      payoff: projection.payoff,
      adversePct: projection.adversePct,
      favorablePct: projection.favorablePct,
      targetFirstPct: projection.targetFirstPct,
      edge: projection.edge,
      analogs: projection.analogs,
      eligible: !candidate.blocksRoom
        && projection.projectedGainPct != null
        && projection.expectancyPct != null
        && projection.expectancyPct > resolved.expectancyFloorPct
        && (resolved.edgeFloor == null || (projection.edge != null && projection.edge >= resolved.edgeFloor))
        && (candidate.setup.riseScore >= resolved.strengthFloor || candidate.setup.room),
    };
  });
  const eligible = scored
    .filter((row) => row.eligible)
    .sort((left, right) => (right.expectancyPct ?? Number.NEGATIVE_INFINITY) - (left.expectancyPct ?? Number.NEGATIVE_INFINITY)
      || (right.edge ?? Number.NEGATIVE_INFINITY) - (left.edge ?? Number.NEGATIVE_INFINITY)
      || (right.projectedGainPct ?? Number.NEGATIVE_INFINITY) - (left.projectedGainPct ?? Number.NEGATIVE_INFINITY)
      || right.strength - left.strength
      || left.symbol.localeCompare(right.symbol));
  eligible.forEach((row, index) => {
    row.rank = index + 1;
  });
  return {
    horizonSessions: 5,
    model: "mercury-analog-rank-v3",
    considered: scored,
    picks: eligible.slice(0, cap),
  };
}
