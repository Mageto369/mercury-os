/** Read an Alpaca paper account, or send one day order to that paper host. */

export const ALPACA_PAPER_MAX_QTY = 10;

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

export type AlpacaPaperSide = "buy" | "sell";

export interface AlpacaPaperOrderResult {
  ok: boolean;
  mode: "alpaca-paper";
  reason: string | null;
  origin: string;
  capitalExecutionEnabled: false;
  liveBroker: false;
  placed: boolean;
  replayed: boolean;
  order: {
    symbol: string;
    side: AlpacaPaperSide;
    quantity: number;
    status: string;
    clientOrderId: string;
  } | null;
}

const NO_ORDER: AlpacaPaperOrderResult = {
  ok: false,
  mode: "alpaca-paper",
  reason: "alpaca_paper_not_configured",
  origin: ALPACA_PAPER_ORIGIN,
  capitalExecutionEnabled: false,
  liveBroker: false,
  placed: false,
  replayed: false,
  order: null,
};

function orderResult(reason: string | null, ok: boolean, order: AlpacaPaperOrderResult["order"] = null, flags?: { placed?: boolean; replayed?: boolean }): AlpacaPaperOrderResult {
  return {
    ...NO_ORDER,
    ok,
    reason,
    placed: flags?.placed === true,
    replayed: flags?.replayed === true,
    order,
  };
}

/** One paper order per symbol, side, and book day. The id is short enough for Alpaca. */
export function alpacaPaperClientOrderId(symbol: string, side: AlpacaPaperSide, day: string) {
  if (side !== "buy" && side !== "sell") {
    const unexpected: never = side;
    return unexpected;
  }
  if (!/^[A-Z]{1,5}$/.test(symbol)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
  const id = `mercury-${symbol}-${side}-${day}`;
  return id.length <= 48 ? id : null;
}

/** A buy needs the eligible-buy gate. A sell only reduces a long paper position. */
export function alpacaPaperOrderAllowed(input: {
  side: AlpacaPaperSide;
  quantity: number;
  gatePass: boolean;
  heldQty: number;
  positionSide: string;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > ALPACA_PAPER_MAX_QTY) {
    return { ok: false as const, reason: "invalid_quantity" as const };
  }
  switch (input.side) {
    case "buy":
      return input.gatePass ? { ok: true as const } : { ok: false as const, reason: "not_eligible" as const };
    case "sell":
      return input.positionSide === "long" && input.heldQty >= input.quantity
        ? { ok: true as const }
        : { ok: false as const, reason: "insufficient_position" as const };
    default: {
      const unexpected: never = input.side;
      return unexpected;
    }
  }
}

function brokerOrder(value: unknown, expected: { symbol: string; side: AlpacaPaperSide; quantity: number; clientOrderId: string }) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const symbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
  if (row.side !== "buy" && row.side !== "sell") return null;
  const side: AlpacaPaperSide = row.side;
  const qty = amount(row.qty);
  const status = typeof row.status === "string" ? row.status : "";
  const clientOrderId = typeof row.client_order_id === "string" ? row.client_order_id : "";
  if (symbol !== expected.symbol || side !== expected.side || qty !== expected.quantity || clientOrderId !== expected.clientOrderId || !status) return null;
  return { symbol, side, quantity: expected.quantity, status, clientOrderId };
}

/** Send one market day order to the paper host, or return the order already stored under the same id. */
export async function submitAlpacaPaperOrder(input: {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  symbol: string;
  side: AlpacaPaperSide;
  quantity: number;
  day: string;
  gatePass: boolean;
}): Promise<AlpacaPaperOrderResult> {
  const env = input.env ?? process.env;
  const origin = alpacaPaperOrigin(env.ALPACA_API_BASE_URL);
  if (!origin.ok) return orderResult(origin.reason, false);
  const symbol = input.symbol.trim().toUpperCase();
  const clientOrderId = alpacaPaperClientOrderId(symbol, input.side, input.day);
  if (!clientOrderId) return orderResult("invalid_order", false);
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > ALPACA_PAPER_MAX_QTY) {
    return orderResult("invalid_quantity", false);
  }
  if (input.side === "buy" && !input.gatePass) return orderResult("not_eligible", false);

  const key = env.ALPACA_API_KEY_ID?.trim() ?? "";
  const secret = env.ALPACA_API_SECRET_KEY?.trim() ?? "";
  if (!key || !secret) return orderResult("alpaca_paper_not_configured", false);
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
    accept: "application/json",
  };

  const call = async (url: string, method: "GET" | "POST", body?: string) => {
    const response = await fetchImpl(url, {
      method,
      headers: body ? { ...headers, "content-type": "application/json" } : headers,
      body,
      signal: AbortSignal.timeout(8_000),
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) return { kind: "redirect" as const, response };
    if (!samePaperHost(response)) return { kind: "redirect" as const, response };
    return { kind: "done" as const, response };
  };

  try {
    let heldQty = 0;
    let positionSide = "";
    if (input.side === "sell") {
      const position = await call(`${origin.origin}/v2/positions/${symbol}`, "GET");
      if (position.kind === "redirect") return orderResult("paper_host_required", false);
      if (position.response.status === 404) {
        heldQty = 0;
      } else if (!position.response.ok) {
        return orderResult(`alpaca_http_${position.response.status}`, false);
      } else {
        const parsed = positionFrom(await readJson(position.response));
        if (!parsed || parsed.symbol !== symbol) return orderResult("alpaca_response_unreadable", false);
        heldQty = parsed.qty ?? 0;
        positionSide = parsed.side;
      }
      const allowed = alpacaPaperOrderAllowed({
        side: "sell",
        quantity: input.quantity,
        gatePass: false,
        heldQty,
        positionSide,
      });
      if (!allowed.ok) return orderResult(allowed.reason, false);
    }

    const expected = { symbol, side: input.side, quantity: input.quantity, clientOrderId };
    const lookupUrl = `${origin.origin}/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`;
    const existing = await call(lookupUrl, "GET");
    if (existing.kind === "redirect") return orderResult("paper_host_required", false);
    if (existing.response.ok) {
      const order = brokerOrder(await readJson(existing.response), expected);
      return order ? orderResult(null, true, order, { replayed: true }) : orderResult("order_mismatch", false);
    }
    if (existing.response.status !== 404) return orderResult(`alpaca_http_${existing.response.status}`, false);

    const payload = JSON.stringify({
      symbol,
      qty: String(input.quantity),
      side: input.side,
      type: "market",
      time_in_force: "day",
      client_order_id: clientOrderId,
    });
    const created = await call(`${origin.origin}/v2/orders`, "POST", payload);
    if (created.kind === "redirect") return orderResult("paper_host_required", false);
    if (created.response.status === 422) {
      const replay = await call(lookupUrl, "GET");
      if (replay.kind === "redirect") return orderResult("paper_host_required", false);
      if (!replay.response.ok) return orderResult("alpaca_order_rejected", false);
      const order = brokerOrder(await readJson(replay.response), expected);
      return order ? orderResult(null, true, order, { replayed: true }) : orderResult("order_mismatch", false);
    }
    if (!created.response.ok) return orderResult(`alpaca_http_${created.response.status}`, false);
    const order = brokerOrder(await readJson(created.response), expected);
    return order ? orderResult(null, true, order, { placed: true }) : orderResult("order_mismatch", false);
  } catch {
    return orderResult("alpaca_unreachable", false);
  }
}
