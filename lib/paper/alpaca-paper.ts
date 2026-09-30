/** Read an Alpaca paper account. This module has no order call. */

export const ALPACA_PAPER_ORIGIN = "https://paper-api.alpaca.markets";

export type AlpacaPaperStatus = "unconfigured" | "connected" | "refused" | "unreachable";

export interface AlpacaPaperAccount {
  status: string;
  currency: string;
  cash: number | null;
  equity: number | null;
  buyingPower: number | null;
  portfolioValue: number | null;
}

export interface AlpacaPaperPosition {
  symbol: string;
  qty: number | null;
  side: string;
  marketValue: number | null;
  unrealizedPl: number | null;
  avgEntryPrice: number | null;
}

export interface AlpacaPaperSnapshot {
  ok: boolean;
  mode: "alpaca-paper";
  status: AlpacaPaperStatus;
  reason: string | null;
  origin: string;
  capitalExecutionEnabled: false;
  liveBroker: false;
  ordersEnabled: false;
  account: AlpacaPaperAccount | null;
  positionCount: number;
  positions: AlpacaPaperPosition[];
}

const EMPTY: AlpacaPaperSnapshot = {
  ok: false,
  mode: "alpaca-paper",
  status: "unconfigured",
  reason: "alpaca_paper_not_configured",
  origin: ALPACA_PAPER_ORIGIN,
  capitalExecutionEnabled: false,
  liveBroker: false,
  ordersEnabled: false,
  account: null,
  positionCount: 0,
  positions: [],
};

function locked(status: AlpacaPaperStatus, reason: string | null, ok: boolean): AlpacaPaperSnapshot {
  return { ...EMPTY, ok, status, reason };
}

export function alpacaPaperOrigin(configured: string | undefined) {
  const raw = configured?.trim() || ALPACA_PAPER_ORIGIN;
  try {
    const url = new URL(raw);
    const barePath = url.pathname === "" || url.pathname === "/";
    if (url.protocol === "https:" && url.hostname === "paper-api.alpaca.markets" && url.port === "" && barePath && url.username === "" && url.password === "" && url.search === "" && url.hash === "") {
      return { ok: true as const, origin: ALPACA_PAPER_ORIGIN };
    }
  } catch {
    return { ok: false as const, reason: "paper_host_required" as const };
  }
  return { ok: false as const, reason: "paper_host_required" as const };
}

function amount(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function accountFrom(value: unknown): AlpacaPaperAccount | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : "";
  if (!status) return null;
  return {
    status,
    currency: typeof row.currency === "string" && row.currency ? row.currency : "USD",
    cash: amount(row.cash),
    equity: amount(row.equity),
    buyingPower: amount(row.buying_power),
    portfolioValue: amount(row.portfolio_value),
  };
}

function positionFrom(value: unknown): AlpacaPaperPosition | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const symbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
  if (!symbol) return null;
  return {
    symbol,
    qty: amount(row.qty),
    side: typeof row.side === "string" ? row.side : "",
    marketValue: amount(row.market_value),
    unrealizedPl: amount(row.unrealized_pl),
    avgEntryPrice: amount(row.avg_entry_price),
  };
}

function samePaperHost(response: Response) {
  if (!response.url) return true;
  try {
    return new URL(response.url).hostname === "paper-api.alpaca.markets";
  } catch {
    return false;
  }
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Buying power and positions from the paper host. A missing key or any other host does not call out. */
export async function readAlpacaPaperAccount(input?: {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<AlpacaPaperSnapshot> {
  const env = input?.env ?? process.env;
  const origin = alpacaPaperOrigin(env.ALPACA_API_BASE_URL);
  if (!origin.ok) return locked("refused", origin.reason, false);
  const key = env.ALPACA_API_KEY_ID?.trim() ?? "";
  const secret = env.ALPACA_API_SECRET_KEY?.trim() ?? "";
  if (!key || !secret) return locked("unconfigured", "alpaca_paper_not_configured", false);

  const fetchImpl = input?.fetchImpl ?? fetch;
  const headers = {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
    accept: "application/json",
  };
  try {
    const signal = AbortSignal.timeout(8_000);
    const [accountResponse, positionsResponse] = await Promise.all([
      fetchImpl(`${origin.origin}/v2/account`, { method: "GET", headers, signal, redirect: "manual" }),
      fetchImpl(`${origin.origin}/v2/positions`, { method: "GET", headers, signal, redirect: "manual" }),
    ]);
    if (accountResponse.status >= 300 && accountResponse.status < 400) return locked("refused", "paper_host_required", false);
    if (positionsResponse.status >= 300 && positionsResponse.status < 400) return locked("refused", "paper_host_required", false);
    if (!accountResponse.ok || !positionsResponse.ok) {
      const code = !accountResponse.ok ? accountResponse.status : positionsResponse.status;
      return locked("unreachable", `alpaca_http_${code}`, false);
    }
    if (!samePaperHost(accountResponse) || !samePaperHost(positionsResponse)) return locked("refused", "paper_host_required", false);
    const account = accountFrom(await readJson(accountResponse));
    const positionBody = await readJson(positionsResponse);
    if (!account || !Array.isArray(positionBody)) return locked("unreachable", "alpaca_response_unreadable", false);
    const positions = positionBody.flatMap((row) => {
      const position = positionFrom(row);
      return position ? [position] : [];
    }).sort((left, right) => Math.abs(right.marketValue ?? 0) - Math.abs(left.marketValue ?? 0) || left.symbol.localeCompare(right.symbol));
    return {
      ...locked("connected", null, true),
      account,
      positionCount: positions.length,
      positions: positions.slice(0, 12),
    };
  } catch {
    return locked("unreachable", "alpaca_unreachable", false);
  }
}
