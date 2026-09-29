export interface StoredDailyBar {
  date: string;
  close: number;
  volume: number | null;
  high?: number | null;
  low?: number | null;
}

export interface SymbolPriceHistory {
  closes: number[];
  sessions: StoredDailyBar[];
  previousClose: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  return5Pct: number | null;
  relativeVolume: number | null;
  rangePositionPct: number | null;
  extension20Pct: number | null;
  closeLocationPct: number | null;
  rise: RiseRoom;
}

export interface RiseRoom {
  score: number | null;
  room: boolean;
}

const EMPTY_HISTORY: SymbolPriceHistory = {
  closes: [],
  sessions: [],
  previousClose: null,
  changePct: null,
  high: null,
  low: null,
  return5Pct: null,
  relativeVolume: null,
  rangePositionPct: null,
  extension20Pct: null,
  closeLocationPct: null,
  rise: { score: null, room: false },
};

const EXTENSION_SESSIONS = 20;

const RELATIVE_VOLUME_BASELINE = 20;
const RELATIVE_VOLUME_MIN_SESSIONS = 5;

function percentChange(from: number | null, to: number | null) {
  if (from == null || to == null || !(from > 0) || !Number.isFinite(to)) return null;
  return Number((((to - from) / from) * 100).toFixed(2));
}

function closeSessionsAgo(closes: number[], sessionsAgo: number, sameAsLast: boolean) {
  const index = closes.length - (sameAsLast ? sessionsAgo + 1 : sessionsAgo);
  if (index < 0) return null;
  return closes[index] ?? null;
}

function relativeVolume(bars: StoredDailyBar[], sameAsLast: boolean) {
  if (!sameAsLast) return null;
  const latest = bars[bars.length - 1]?.volume;
  if (latest == null || !(latest > 0)) return null;
  const prior = bars
    .slice(0, -1)
    .slice(-RELATIVE_VOLUME_BASELINE)
    .map((bar) => bar.volume)
    .filter((volume): volume is number => volume != null && volume > 0);
  if (prior.length < RELATIVE_VOLUME_MIN_SESSIONS) return null;
  const average = prior.reduce((sum, volume) => sum + volume, 0) / prior.length;
  if (!(average > 0)) return null;
  return Number((latest / average).toFixed(2));
}

function rangePosition(price: number | null, high: number | null, low: number | null) {
  if (price == null || high == null || low == null) return null;
  const span = high - low;
  if (!(span > 0)) return null;
  return Number((((price - low) / span) * 100).toFixed(0));
}

function extension20(price: number | null, closes: number[]) {
  if (price == null || closes.length < EXTENSION_SESSIONS) return null;
  const window = closes.slice(-EXTENSION_SESSIONS);
  const average = window.reduce((sum, close) => sum + close, 0) / window.length;
  return percentChange(average, price);
}

function closeLocation(bars: StoredDailyBar[], sameAsLast: boolean) {
  if (!sameAsLast) return null;
  const latest = bars[bars.length - 1];
  if (!latest || latest.high == null || latest.low == null) return null;
  return rangePosition(latest.close, latest.high, latest.low);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function trendScore(return5Pct: number) {
  if (return5Pct < 0) return clampScore(30 + return5Pct * 3);
  if (return5Pct <= 12) return clampScore(60 + return5Pct * (10 / 3));
  return clampScore(100 - (return5Pct - 12) * 3);
}

function roomDistanceScore(extension20Pct: number) {
  if (extension20Pct < 0) return clampScore(40 + extension20Pct * 4);
  if (extension20Pct <= 8) return clampScore(70 + extension20Pct * 3.75);
  return clampScore(100 - (extension20Pct - 8) * 4);
}

/** Higher when the rise is confirmed and the price is still near the 20-session average. */
export function scoreRiseRoom(input: {
  return5Pct: number | null;
  relativeVolume: number | null;
  extension20Pct: number | null;
  closeLocationPct: number | null;
}): RiseRoom {
  const { return5Pct, relativeVolume, extension20Pct, closeLocationPct } = input;
  if (return5Pct == null || relativeVolume == null || extension20Pct == null || closeLocationPct == null) {
    return { score: null, room: false };
  }
  const score = Math.round(
    roomDistanceScore(extension20Pct) * 0.4
    + closeLocationPct * 0.25
    + trendScore(return5Pct) * 0.2
    + clampScore(relativeVolume * 50) * 0.15,
  );
  const room = return5Pct > 0 && relativeVolume > 1 && extension20Pct > 0 && extension20Pct < 15 && closeLocationPct >= 60;
  return { score, room };
}

export function summarizePriceHistory(price: number | null, bars: StoredDailyBar[]): SymbolPriceHistory {
  const ordered = [...bars].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  const closes = ordered.map((bar) => bar.close);
  if (!closes.length) return EMPTY_HISTORY;
  const latest = closes[closes.length - 1] ?? null;
  const prior = closes.length >= 2 ? closes[closes.length - 2] ?? null : null;
  const sameAsLast = price != null && latest != null && Math.abs(price - latest) < 0.0001;
  const previousClose = sameAsLast ? prior : latest;
  const high = Number(Math.max(...closes).toFixed(4));
  const low = Number(Math.min(...closes).toFixed(4));
  const summary = {
    closes,
    sessions: [...ordered].reverse().slice(0, 8),
    previousClose,
    changePct: percentChange(previousClose, price),
    high,
    low,
    return5Pct: percentChange(closeSessionsAgo(closes, 5, sameAsLast), price),
    relativeVolume: relativeVolume(ordered, sameAsLast),
    rangePositionPct: rangePosition(price, high, low),
    extension20Pct: extension20(price, closes),
    closeLocationPct: closeLocation(ordered, sameAsLast),
  };
  return { ...summary, rise: scoreRiseRoom(summary) };
}

export interface NasdaqDailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

interface NasdaqHistoricalBody {
  data?: {
    tradesTable?: {
      rows?: Array<Record<string, unknown>>;
    } | null;
  } | null;
}

function numberFromText(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function isoDate(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Delayed Nasdaq historical rows. Unusable sessions are dropped. Oldest first. */
export function parseNasdaqHistoricalBars(body: NasdaqHistoricalBody): NasdaqDailyBar[] {
  const rows = body.data?.tradesTable?.rows ?? [];
  const byDate = new Map<string, NasdaqDailyBar>();
  for (const row of rows) {
    const date = isoDate(row.date);
    const close = numberFromText(row.close);
    const open = numberFromText(row.open);
    const high = numberFromText(row.high);
    const low = numberFromText(row.low);
    const volume = numberFromText(row.volume);
    if (!date || !Number.isFinite(close) || close <= 0) continue;
    if (![open, high, low].every((value) => Number.isFinite(value) && value > 0)) continue;
    byDate.set(date, {
      date,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) && volume >= 0 ? volume : null,
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchNasdaqHistoricalBars(symbol: string, fromDate: string, toDate: string) {
  const url = new URL(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical`);
  url.searchParams.set("assetclass", "stocks");
  url.searchParams.set("fromdate", fromDate);
  url.searchParams.set("todate", toDate);
  url.searchParams.set("limit", "90");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      redirect: "error",
      headers: {
        accept: "application/json",
        "user-agent": "MercuryOS/0.4 research-only market reference",
      },
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return parseNasdaqHistoricalBars((await response.json()) as NasdaqHistoricalBody);
  } finally {
    clearTimeout(timeout);
  }
}
