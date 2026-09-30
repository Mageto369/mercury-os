/** One knob per night. The holdout is scored only after a train step is chosen, and nothing here promotes a card. */

export const SEARCH_KNOBS = [
  "relativeVolume",
  "extension",
  "closeLocation",
  "weights",
  "distance",
  "minAnalogs",
  "expectancyFloor",
  "edgeFloor",
  "strengthFloor",
] as const;

export type SearchKnob = (typeof SEARCH_KNOBS)[number];

export const MIN_LABELED_SESSIONS = 21;
export const HOLDOUT_SESSIONS = 20;
const TRAIN_TEN_SLOTS = 20;
const PATH_SLACK = 0.5;

const RVOL_GRID = [1, 1.2, 1.4, 1.6];
const EXTENSION_GRID = [8, 10, 12, 14, 16, 18, 20];
const CLOSE_GRID = [50, 55, 60, 65, 70, 75];
const DISTANCE_GRID = [1.05, 1.2, 1.35, 1.5, 1.65];
const ANALOG_GRID = [8, 12, 16];
const EXPECTANCY_GRID = [0, 0.25, 0.5, 1];
const EDGE_GRID: Array<number | null> = [null, 0.25, 0.5];
const STRENGTH_GRID = [40, 50, 60];
const WEIGHT_STEP = 5;
const WEIGHTS = [
  { key: "riseWeightRoom", center: 40 },
  { key: "riseWeightHold", center: 25 },
  { key: "riseWeightTrend", center: 20 },
  { key: "riseWeightVolume", center: 15 },
] as const;

export interface SearchCard {
  roomRelativeVolumeFloor: number;
  roomExtensionCapPct: number;
  roomCloseLocationFloor: number;
  riseWeightRoom: number;
  riseWeightHold: number;
  riseWeightTrend: number;
  riseWeightVolume: number;
  analogDistanceCap: number;
  minAnalogs: number;
  expectancyFloorPct: number;
  edgeFloor: number | null;
  strengthFloor: number;
}

export interface SearchScore {
  tenSlots: number;
  selectionPct: number | null;
  tenAdversePct: number | null;
  calibrationPct: number | null;
}

export type SearchReason =
  | "need_labeled_sessions"
  | "no_legal_step"
  | "train_coverage"
  | "holdout_selection"
  | "holdout_path"
  | "holdout_calibration"
  | "holdout_coverage"
  | "candidate";

export interface SessionWindows {
  dates: string[];
  train: string[];
  holdout: string[];
  ready: boolean;
}

export interface ChallengerSearch<T> {
  status: "candidate" | "rejected" | "insufficient";
  reason: SearchReason;
  knob: SearchKnob;
  nextKnob: SearchKnob;
  promoted: false;
  capitalExecutionEnabled: false;
  evidenceClass: "delayed-reference";
  card: T | null;
  train: { champion: SearchScore | null; challenger: SearchScore | null };
  holdout: { champion: SearchScore | null; challenger: SearchScore | null };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function round2(value: number) {
  return Number(value.toFixed(2));
}

export function isSearchKnob(value: unknown): value is SearchKnob {
  return typeof value === "string" && (SEARCH_KNOBS as readonly string[]).includes(value);
}

export function nextKnob(knob: SearchKnob): SearchKnob {
  const index = SEARCH_KNOBS.indexOf(knob);
  return SEARCH_KNOBS[(index + 1) % SEARCH_KNOBS.length] ?? "relativeVolume";
}

/** Latest 20 labeled sessions are the holdout. Train is every earlier session, with no shared date. */
export function splitSessions(dates: readonly string[]): SessionWindows {
  const unique = [...new Set(dates.filter((date) => DATE.test(date)))].sort();
  if (unique.length < MIN_LABELED_SESSIONS) {
    return { dates: unique, train: unique, holdout: [], ready: false };
  }
  return {
    dates: unique,
    train: unique.slice(0, -HOLDOUT_SESSIONS),
    holdout: unique.slice(-HOLDOUT_SESSIONS),
    ready: true,
  };
}

function adjacent(value: number, grid: readonly number[]) {
  const current = round2(value);
  const index = grid.findIndex((step) => round2(step) === current);
  if (index >= 0) return [grid[index - 1], grid[index + 1]].filter((step): step is number => step != null);
  const below = [...grid].reverse().find((step) => step < current);
  const above = grid.find((step) => step > current);
  return [below, above].filter((step): step is number => step != null);
}

function adjacentEdge(value: number | null) {
  const index = EDGE_GRID.findIndex((step) => step === value);
  if (index >= 0) return [EDGE_GRID[index - 1], EDGE_GRID[index + 1]].filter((step): step is number | null => step !== undefined);
  const numeric = EDGE_GRID.filter((step): step is number => step != null);
  const below = [...numeric].reverse().find((step) => value != null && step < value);
  const above = numeric.find((step) => value != null && step > value);
  const steps: Array<number | null> = [];
  if (below == null && EDGE_GRID.includes(null)) steps.push(null);
  else if (below != null) steps.push(below);
  if (above != null) steps.push(above);
  return steps;
}

function weightNeighbors<T extends SearchCard>(card: T) {
  const cards: T[] = [];
  for (const donor of WEIGHTS) {
    for (const receiver of WEIGHTS) {
      if (donor.key === receiver.key) continue;
      const donated = card[donor.key] - WEIGHT_STEP;
      const received = card[receiver.key] + WEIGHT_STEP;
      const donorOk = donated >= donor.center - WEIGHT_STEP && donated <= donor.center + WEIGHT_STEP;
      const receiverOk = received >= receiver.center - WEIGHT_STEP && received <= receiver.center + WEIGHT_STEP;
      if (!donorOk || !receiverOk) continue;
      cards.push({ ...card, [donor.key]: donated, [receiver.key]: received });
    }
  }
  return cards;
}

/** One grid step from the current card. An off-grid value steps to the points on either side, not the whole grid. */
export function neighbors<T extends SearchCard>(card: T, knob: SearchKnob): T[] {
  switch (knob) {
    case "relativeVolume":
      return adjacent(card.roomRelativeVolumeFloor, RVOL_GRID).map((value) => ({ ...card, roomRelativeVolumeFloor: value }));
    case "extension":
      return adjacent(card.roomExtensionCapPct, EXTENSION_GRID).map((value) => ({ ...card, roomExtensionCapPct: value }));
    case "closeLocation":
      return adjacent(card.roomCloseLocationFloor, CLOSE_GRID).map((value) => ({ ...card, roomCloseLocationFloor: value }));
    case "weights":
      return weightNeighbors(card);
    case "distance":
      return adjacent(card.analogDistanceCap, DISTANCE_GRID).map((value) => ({ ...card, analogDistanceCap: value }));
    case "minAnalogs":
      return adjacent(card.minAnalogs, ANALOG_GRID).map((value) => ({ ...card, minAnalogs: value }));
    case "expectancyFloor":
      return adjacent(card.expectancyFloorPct, EXPECTANCY_GRID).map((value) => ({ ...card, expectancyFloorPct: value }));
    case "edgeFloor":
      return adjacentEdge(card.edgeFloor).map((value) => ({ ...card, edgeFloor: value }));
    case "strengthFloor":
      return adjacent(card.strengthFloor, STRENGTH_GRID).map((value) => ({ ...card, strengthFloor: value }));
    default: {
      const unexpected: never = knob;
      return unexpected;
    }
  }
}

function blank<T>(knob: SearchKnob, reason: SearchReason, advance: boolean): ChallengerSearch<T> {
  return {
    status: "insufficient",
    reason,
    knob,
    nextKnob: advance ? nextKnob(knob) : knob,
    promoted: false,
    capitalExecutionEnabled: false,
    evidenceClass: "delayed-reference",
    card: null,
    train: { champion: null, challenger: null },
    holdout: { champion: null, challenger: null },
  };
}

function pathWithin(base: number | null, next: number | null) {
  if (base == null || next == null || !Number.isFinite(base) || !Number.isFinite(next)) return false;
  return next >= base - PATH_SLACK;
}

function passesTrain(base: SearchScore, next: SearchScore) {
  return next.tenSlots >= TRAIN_TEN_SLOTS && next.selectionPct != null && pathWithin(base.tenAdversePct, next.tenAdversePct);
}

function gradeHoldout(champion: SearchScore, challenger: SearchScore): SearchReason {
  if (champion.tenSlots < TRAIN_TEN_SLOTS || challenger.tenSlots < TRAIN_TEN_SLOTS) return "holdout_coverage";
  if (champion.selectionPct == null || challenger.selectionPct == null || !(challenger.selectionPct > champion.selectionPct)) return "holdout_selection";
  if (!pathWithin(champion.tenAdversePct, challenger.tenAdversePct)) return "holdout_path";
  if (
    champion.calibrationPct == null
    || challenger.calibrationPct == null
    || !Number.isFinite(champion.calibrationPct)
    || !Number.isFinite(challenger.calibrationPct)
    || challenger.calibrationPct > champion.calibrationPct + PATH_SLACK
  ) return "holdout_calibration";
  return "candidate";
}

/**
 * Score the champion and each legal neighbor on train dates only.
 * The holdout dates are passed to `score` after one neighbor wins the train gate.
 */
export function chooseChallenger<T extends SearchCard>(input: {
  champion: T;
  knob: SearchKnob;
  sessionDates: readonly string[];
  accept: (card: T) => boolean;
  score: (card: T, dates: readonly string[]) => SearchScore;
}): ChallengerSearch<T> {
  const windows = splitSessions(input.sessionDates);
  if (!windows.ready) return blank(input.knob, "need_labeled_sessions", false);
  const legal = neighbors(input.champion, input.knob).filter((card) => input.accept(card));
  if (!legal.length) return blank(input.knob, "no_legal_step", true);

  const championTrain = input.score(input.champion, windows.train);
  let winner: { card: T; score: SearchScore } | null = null;
  for (const card of legal) {
    const scored = input.score(card, windows.train);
    if (!passesTrain(championTrain, scored)) continue;
    if (winner && (scored.selectionPct ?? Number.NEGATIVE_INFINITY) <= (winner.score.selectionPct ?? Number.NEGATIVE_INFINITY)) continue;
    winner = { card, score: scored };
  }
  if (!winner) {
    return {
      ...blank(input.knob, "train_coverage", true),
      status: "rejected",
      train: { champion: championTrain, challenger: null },
    };
  }

  const championHoldout = input.score(input.champion, windows.holdout);
  const challengerHoldout = input.score(winner.card, windows.holdout);
  const reason = gradeHoldout(championHoldout, challengerHoldout);
  return {
    status: reason === "candidate" ? "candidate" : "rejected",
    reason,
    knob: input.knob,
    nextKnob: nextKnob(input.knob),
    promoted: false,
    capitalExecutionEnabled: false,
    evidenceClass: "delayed-reference",
    card: winner.card,
    train: { champion: championTrain, challenger: winner.score },
    holdout: { champion: championHoldout, challenger: challengerHoldout },
  };
}
