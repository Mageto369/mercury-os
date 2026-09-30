export const RESEARCH_CARD_KEY = "mercury-analog-rank";
export const RESEARCH_CARD_VERSION = "v3-constants";

/** The numbers the daily ten uses today. The rank still reads its own constants. */
export interface ResearchRuleCard {
  version: string;
  model: "mercury-analog-rank-v3";
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
  horizonSessions: 5;
  evidenceClass: "delayed-reference";
  capitalExecutionEnabled: false;
}

export const SEED_RULE_CARD: ResearchRuleCard = {
  version: RESEARCH_CARD_VERSION,
  model: "mercury-analog-rank-v3",
  roomRelativeVolumeFloor: 1,
  roomExtensionCapPct: 15,
  roomCloseLocationFloor: 60,
  riseWeightRoom: 40,
  riseWeightHold: 25,
  riseWeightTrend: 20,
  riseWeightVolume: 15,
  analogDistanceCap: 1.35,
  minAnalogs: 8,
  expectancyFloorPct: 0,
  edgeFloor: null,
  strengthFloor: 50,
  horizonSessions: 5,
  evidenceClass: "delayed-reference",
  capitalExecutionEnabled: false,
};

const CARD_KEYS = [
  "version",
  "model",
  "roomRelativeVolumeFloor",
  "roomExtensionCapPct",
  "roomCloseLocationFloor",
  "riseWeightRoom",
  "riseWeightHold",
  "riseWeightTrend",
  "riseWeightVolume",
  "analogDistanceCap",
  "minAnalogs",
  "expectancyFloorPct",
  "edgeFloor",
  "strengthFloor",
  "horizonSessions",
  "evidenceClass",
  "capitalExecutionEnabled",
] as const satisfies readonly (keyof ResearchRuleCard)[];

export function canonicalRuleCard(card: ResearchRuleCard) {
  const ordered = {} as Record<(typeof CARD_KEYS)[number], ResearchRuleCard[(typeof CARD_KEYS)[number]]>;
  for (const key of CARD_KEYS) ordered[key] = card[key];
  return ordered;
}

export function cardHash(card: ResearchRuleCard) {
  let hash = 2166136261;
  const text = JSON.stringify(canonicalRuleCard(card));
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function between(value: number, low: number, high: number) {
  return value >= low && value <= high;
}

/** A card the nightly search is allowed to store. Capital stays off. */
export function cardWithinBounds(card: ResearchRuleCard) {
  const weights = card.riseWeightRoom + card.riseWeightHold + card.riseWeightTrend + card.riseWeightVolume;
  const edgeOk = card.edgeFloor == null || card.edgeFloor === 0.25 || card.edgeFloor === 0.5;
  return weights === 100
    && between(card.roomRelativeVolumeFloor, 1, 1.6)
    && between(card.roomExtensionCapPct, 8, 20)
    && between(card.roomCloseLocationFloor, 50, 75)
    && between(card.riseWeightRoom, 35, 45)
    && between(card.riseWeightHold, 20, 30)
    && between(card.riseWeightTrend, 15, 25)
    && between(card.riseWeightVolume, 10, 20)
    && between(card.analogDistanceCap, 1.05, 1.65)
    && (card.minAnalogs === 8 || card.minAnalogs === 12 || card.minAnalogs === 16)
    && (card.expectancyFloorPct === 0 || card.expectancyFloorPct === 0.25 || card.expectancyFloorPct === 0.5 || card.expectancyFloorPct === 1)
    && edgeOk
    && (card.strengthFloor === 40 || card.strengthFloor === 50 || card.strengthFloor === 60)
    && card.horizonSessions === 5
    && card.evidenceClass === "delayed-reference"
    && card.capitalExecutionEnabled === false;
}
