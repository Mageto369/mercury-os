export interface SessionBar {
  date: string;
  close: number;
  high?: number | null;
  low?: number | null;
}

export interface SessionRisk {
  volatilityPct: number | null;
  atrPct: number | null;
  sharesPer10k: number | null;
  notionalPer10k: number | null;
  riskBudgetUsd: 50;
  capitalBaseUsd: 10000;
}

const RISK_BUDGET_USD = 50;
const CAPITAL_BASE_USD = 10_000;
const VOL_SESSIONS = 20;
const MIN_RETURNS = 10;
const ATR_PERIODS = 14;

function round2(value: number) {
  return Number(value.toFixed(2));
}

/** Sample standard deviation of the last 20 daily simple returns, in percent. */
export function dailyVolatilityPct(closes: number[]) {
  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1] ?? 0;
    const close = closes[index] ?? 0;
    if (!(previous > 0) || !(close > 0)) continue;
    returns.push((close - previous) / previous);
  }
  const sample = returns.slice(-VOL_SESSIONS);
  if (sample.length < MIN_RETURNS) return null;
  const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const variance = sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sample.length - 1);
  return round2(Math.sqrt(variance) * 100);
}

/** Average true range over 14 sessions, as a percent of the latest close. */
export function averageTrueRangePct(bars: SessionBar[]) {
  const ordered = [...bars].sort((left, right) => left.date.localeCompare(right.date));
  const window = ordered.slice(-(ATR_PERIODS + 1));
  if (window.length < ATR_PERIODS + 1) return null;
  const ranges: number[] = [];
  for (let index = 1; index < window.length; index += 1) {
    const bar = window[index];
    const previous = window[index - 1];
    if (!bar || !previous) return null;
    if (bar.high == null || bar.low == null || !(bar.high > 0) || !(bar.low > 0) || !(previous.close > 0)) return null;
    ranges.push(Math.max(bar.high - bar.low, Math.abs(bar.high - previous.close), Math.abs(bar.low - previous.close)));
  }
  const last = window[window.length - 1]?.close ?? 0;
  if (!(last > 0) || ranges.length !== ATR_PERIODS) return null;
  const average = ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
  return round2((average / last) * 100);
}

/** Shares so a one-sigma day risks 0.5% of $10,000. Advisory only. */
export function volTargetShares(price: number | null, volatilityPct: number | null) {
  if (price == null || !(price > 0) || volatilityPct == null || !(volatilityPct > 0)) {
    return { sharesPer10k: null as number | null, notionalPer10k: null as number | null };
  }
  const dollarMove = price * (volatilityPct / 100);
  if (!(dollarMove > 0)) return { sharesPer10k: null, notionalPer10k: null };
  const shares = Math.floor(RISK_BUDGET_USD / dollarMove);
  return {
    sharesPer10k: shares,
    notionalPer10k: round2(shares * price),
  };
}

export function sessionRisk(price: number | null, bars: SessionBar[]): SessionRisk {
  const ordered = [...bars].sort((left, right) => left.date.localeCompare(right.date));
  const closes = ordered.map((bar) => bar.close).filter((close) => close > 0);
  const volatilityPct = dailyVolatilityPct(closes);
  const atrPct = averageTrueRangePct(ordered);
  const target = volTargetShares(price, volatilityPct);
  return {
    volatilityPct,
    atrPct,
    sharesPer10k: target.sharesPer10k,
    notionalPer10k: target.notionalPer10k,
    riskBudgetUsd: RISK_BUDGET_USD,
    capitalBaseUsd: CAPITAL_BASE_USD,
  };
}

export function pathExcursion(entry: number, futureCloses: number[]) {
  let adverse = 0;
  let favorable = 0;
  if (!(entry > 0)) return { adversePct: null as number | null, favorablePct: null as number | null };
  for (const close of futureCloses) {
    if (!(close > 0)) continue;
    const pct = ((close - entry) / entry) * 100;
    adverse = Math.min(adverse, pct);
    favorable = Math.max(favorable, pct);
  }
  return { adversePct: round2(adverse), favorablePct: round2(favorable) };
}
