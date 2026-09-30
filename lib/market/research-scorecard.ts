export interface ScoredResearchRow {
  sessionDate: string;
  eligible: boolean;
  rank: number | null;
  expectancyPct: number | null;
  room: boolean;
  blocksRoom: boolean;
  gatePass: boolean;
  forward5Pct: number | null;
  realizedAdversePct: number | null;
}

export interface ResearchScorecard {
  teacher: "delayed-daily-5-session";
  status: "recorded" | "insufficient";
  labeledRows: number;
  labeledSessions: number;
  tenSlots: number;
  selectionPct: number | null;
  tenAveragePct: number | null;
  restAveragePct: number | null;
  tenHitPct: number | null;
  restHitPct: number | null;
  calibrationPct: number | null;
  tenAdversePct: number | null;
  gateCount: number;
  gateAveragePct: number | null;
  gateRefusedRoom: number;
  promoted: false;
  capitalExecutionEnabled: false;
  evidenceClass: "delayed-reference";
}

const MIN_TEN_SLOTS = 20;

function round2(value: number) {
  return Number(value.toFixed(2));
}

function average(values: number[]) {
  if (!values.length) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function hitPct(values: number[]) {
  if (!values.length) return null;
  return round2((values.filter((value) => value > 0).length / values.length) * 100);
}

function labeledValue(row: ScoredResearchRow) {
  return row.forward5Pct != null && Number.isFinite(row.forward5Pct) ? row.forward5Pct : null;
}

export function isDailyTen(row: { eligible: boolean; rank: number | null }) {
  return row.eligible && row.rank != null && row.rank >= 1 && row.rank <= 10;
}

/** Grade journaled decisions that already have a 5-session label. Does not promote a card. */
export function scoreResearchBook(rows: ScoredResearchRow[]): ResearchScorecard {
  const labeled = rows.flatMap((row) => {
    const forward = labeledValue(row);
    return forward == null ? [] : [{ ...row, forward }];
  });
  const ten = labeled.filter((row) => isDailyTen(row));
  const rest = labeled.filter((row) => row.eligible && !isDailyTen(row));
  const tenForward = ten.map((row) => row.forward);
  const restForward = rest.map((row) => row.forward);
  const tenAveragePct = average(tenForward);
  const restAveragePct = average(restForward);
  const selectionPct = tenAveragePct != null && restAveragePct != null ? round2(tenAveragePct - restAveragePct) : null;
  const calibrated = labeled.filter((row) => row.expectancyPct != null && Number.isFinite(row.expectancyPct));
  const gate = labeled.filter((row) => row.gatePass);
  const tenAdverse = ten
    .map((row) => row.realizedAdversePct)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const recorded = ten.length >= MIN_TEN_SLOTS && selectionPct != null;
  return {
    teacher: "delayed-daily-5-session",
    status: recorded ? "recorded" : "insufficient",
    labeledRows: labeled.length,
    labeledSessions: new Set(labeled.map((row) => row.sessionDate)).size,
    tenSlots: ten.length,
    selectionPct,
    tenAveragePct,
    restAveragePct,
    tenHitPct: hitPct(tenForward),
    restHitPct: hitPct(restForward),
    calibrationPct: average(calibrated.map((row) => (row.expectancyPct ?? 0) - row.forward)),
    tenAdversePct: average(tenAdverse),
    gateCount: gate.length,
    gateAveragePct: average(gate.map((row) => row.forward)),
    gateRefusedRoom: labeled.filter((row) => row.room && !row.blocksRoom && !row.gatePass).length,
    promoted: false,
    capitalExecutionEnabled: false,
    evidenceClass: "delayed-reference",
  };
}
