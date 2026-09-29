export interface StoredDailyBar {
  date: string;
  close: number;
  volume: number | null;
}

export interface SymbolPriceHistory {
  closes: number[];
  sessions: StoredDailyBar[];
  previousClose: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
}

const EMPTY_HISTORY: SymbolPriceHistory = {
  closes: [],
  sessions: [],
  previousClose: null,
  changePct: null,
  high: null,
  low: null,
};

export function summarizePriceHistory(price: number | null, bars: StoredDailyBar[]): SymbolPriceHistory {
  const ordered = [...bars].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  const closes = ordered.map((bar) => bar.close);
  if (!closes.length) return EMPTY_HISTORY;
  const latest = closes[closes.length - 1] ?? null;
  const prior = closes.length >= 2 ? closes[closes.length - 2] ?? null : null;
  const sameAsLast = price != null && latest != null && Math.abs(price - latest) < 0.0001;
  const previousClose = sameAsLast ? prior : latest;
  const changePct = price != null && previousClose != null && previousClose > 0
    ? Number((((price - previousClose) / previousClose) * 100).toFixed(2))
    : null;
  return {
    closes,
    sessions: [...ordered].reverse().slice(0, 8),
    previousClose,
    changePct,
    high: Number(Math.max(...closes).toFixed(4)),
    low: Number(Math.min(...closes).toFixed(4)),
  };
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
