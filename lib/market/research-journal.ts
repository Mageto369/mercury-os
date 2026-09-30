export interface JournalCandidate {
  symbol: string;
  sessionDate: string;
  evidenceClass: string;
  price: number | null;
  return5Pct: number | null;
  relativeVolume: number | null;
  extension20Pct: number | null;
  closeLocationPct: number | null;
  riseScore: number | null;
  room: boolean;
  blocksRoom: boolean;
  socialHype: number | null;
  catalystScore: number | null;
  shadowAction: string | null;
  regime: string | null;
}

export interface JournalProjection {
  rank: number | null;
  eligible: boolean;
  expectancyPct: number | null;
  projectedGainPct: number | null;
  projectedLowPct: number | null;
  projectedHighPct: number | null;
  edge: number | null;
  winRatePct: number | null;
  payoff: number | null;
  adversePct: number | null;
  favorablePct: number | null;
  targetFirstPct: number | null;
  analogs: number;
}

export interface ResearchDecision {
  id: string;
  sessionDate: string;
  symbol: string;
  cardVersion: string;
  cardHash: string;
  evidenceClass: string;
  price: number | null;
  return5Pct: number | null;
  relativeVolume: number | null;
  extension20Pct: number | null;
  closeLocationPct: number | null;
  riseScore: number | null;
  room: boolean;
  blocksRoom: boolean;
  socialHype: number | null;
  catalystScore: number | null;
  rank: number | null;
  eligible: boolean;
  expectancyPct: number | null;
  projectedGainPct: number | null;
  projectedLowPct: number | null;
  projectedHighPct: number | null;
  edge: number | null;
  winRatePct: number | null;
  payoff: number | null;
  adversePct: number | null;
  favorablePct: number | null;
  targetFirstPct: number | null;
  analogs: number;
  shadowAction: string | null;
  gatePass: boolean;
  regime: string | null;
}

export interface JournalCard {
  version: string;
  hash: string;
  expectancyFloorPct: number;
}

const SESSION_DATE = /^\d{4}-\d{2}-\d{2}$/;

function finiteOrNull(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? value : null;
}

/** A new simulated buy still needs room and an expectancy above the card floor. */
export function researchGatePass(input: { room: boolean; blocksRoom: boolean; expectancyPct: number | null; floorPct: number }) {
  if (!input.room || input.blocksRoom) return false;
  if (input.expectancyPct == null || !Number.isFinite(input.expectancyPct)) return false;
  return input.expectancyPct > input.floorPct;
}

/** One research decision for a symbol and session. Returns null when the session date is unusable. */
export function buildResearchDecision(
  candidate: JournalCandidate,
  projection: JournalProjection | null,
  card: JournalCard,
): ResearchDecision | null {
  const sessionDate = candidate.sessionDate.trim();
  const symbol = candidate.symbol.trim().toUpperCase();
  if (!symbol || !SESSION_DATE.test(sessionDate) || !card.version) return null;
  const expectancyPct = finiteOrNull(projection?.expectancyPct);
  const room = candidate.room && !candidate.blocksRoom;
  return {
    id: `decision:${sessionDate}:${symbol}:${card.version}`,
    sessionDate,
    symbol,
    cardVersion: card.version,
    cardHash: card.hash,
    evidenceClass: candidate.evidenceClass || "delayed-reference",
    price: finiteOrNull(candidate.price),
    return5Pct: finiteOrNull(candidate.return5Pct),
    relativeVolume: finiteOrNull(candidate.relativeVolume),
    extension20Pct: finiteOrNull(candidate.extension20Pct),
    closeLocationPct: finiteOrNull(candidate.closeLocationPct),
    riseScore: finiteOrNull(candidate.riseScore),
    room,
    blocksRoom: candidate.blocksRoom,
    socialHype: finiteOrNull(candidate.socialHype),
    catalystScore: finiteOrNull(candidate.catalystScore),
    rank: projection?.eligible ? finiteOrNull(projection.rank) : null,
    eligible: Boolean(projection?.eligible),
    expectancyPct,
    projectedGainPct: finiteOrNull(projection?.projectedGainPct),
    projectedLowPct: finiteOrNull(projection?.projectedLowPct),
    projectedHighPct: finiteOrNull(projection?.projectedHighPct),
    edge: finiteOrNull(projection?.edge),
    winRatePct: finiteOrNull(projection?.winRatePct),
    payoff: finiteOrNull(projection?.payoff),
    adversePct: finiteOrNull(projection?.adversePct),
    favorablePct: finiteOrNull(projection?.favorablePct),
    targetFirstPct: finiteOrNull(projection?.targetFirstPct),
    analogs: projection?.analogs != null && Number.isFinite(projection.analogs) ? projection.analogs : 0,
    shadowAction: candidate.shadowAction,
    gatePass: researchGatePass({
      room: candidate.room,
      blocksRoom: candidate.blocksRoom,
      expectancyPct,
      floorPct: card.expectancyFloorPct,
    }),
    regime: candidate.regime,
  };
}
