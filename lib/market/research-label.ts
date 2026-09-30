export interface LabelBar {
  date: string;
  close: number;
}

export interface SessionLabel {
  sessionDate: string;
  horizonSessions: number;
  forward5Pct: number;
  adversePct: number;
  favorablePct: number;
  targetFirst: boolean | null;
  entryClose: number;
  exitClose: number;
  barDates: string[];
  evidenceClass: "delayed-reference";
  source: "nasdaq-delayed";
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function pathExtremes(entry: number, futureCloses: number[]) {
  let adverse = 0;
  let favorable = 0;
  let adverseAt = -1;
  let favorableAt = -1;
  if (entry > 0) {
    futureCloses.forEach((close, index) => {
      if (!(close > 0)) return;
      const move = ((close - entry) / entry) * 100;
      if (move < adverse) {
        adverse = move;
        adverseAt = index;
      }
      if (move > favorable) {
        favorable = move;
        favorableAt = index;
      }
    });
  }
  let targetFirst: boolean | null = null;
  if (favorableAt >= 0 && adverseAt < 0) targetFirst = true;
  else if (adverseAt >= 0 && favorableAt < 0) targetFirst = false;
  else if (favorableAt >= 0 && adverseAt >= 0 && favorableAt !== adverseAt) targetFirst = favorableAt < adverseAt;
  return { adversePct: round2(adverse), favorablePct: round2(favorable), targetFirst };
}

/**
 * Realized 5-session path for a session that already has that many later closes.
 * Bars on the session and before it stay out of the forward window.
 */
export function labelForwardSession(bars: LabelBar[], sessionDate: string, horizon = 5): SessionLabel | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || !Number.isInteger(horizon) || horizon < 1) return null;
  const byDate = new Map<string, number>();
  for (const bar of bars) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date) || !(bar.close > 0) || !Number.isFinite(bar.close)) continue;
    byDate.set(bar.date, bar.close);
  }
  const ordered = [...byDate.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  const index = ordered.findIndex(([date]) => date === sessionDate);
  if (index < 0 || index + horizon >= ordered.length) return null;
  const entry = ordered[index]?.[1] ?? 0;
  const exit = ordered[index + horizon]?.[1] ?? 0;
  if (!(entry > 0) || !(exit > 0)) return null;
  const future = ordered.slice(index + 1, index + 1 + horizon);
  if (future.length !== horizon) return null;
  const marks = pathExtremes(entry, future.map((bar) => bar[1]));
  return {
    sessionDate,
    horizonSessions: horizon,
    forward5Pct: round2(((exit - entry) / entry) * 100),
    adversePct: marks.adversePct,
    favorablePct: marks.favorablePct,
    targetFirst: marks.targetFirst,
    entryClose: entry,
    exitClose: exit,
    barDates: [sessionDate, ...future.map((bar) => bar[0])],
    evidenceClass: "delayed-reference",
    source: "nasdaq-delayed",
  };
}
