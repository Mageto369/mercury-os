import { getSql } from "@/lib/db";
import { loadPricePush } from "@/lib/market/attention";
import { loadDailyHistory } from "@/lib/market/daily-history";
import { summarizePriceHistory } from "@/lib/market/nasdaq-history";
import { applyPricePush, EMPTY_PRICE_PUSH } from "@/lib/market/price-push";
import { submitPaperOrder } from "@/lib/paper/submit-order";
import { screenPaperBuy } from "@/lib/workflows/penny-screen";

export type PaperEngineAction = "PRESS" | "WAVE_ACTIVE" | "GEM_WATCH" | "WATCH" | "REDUCE" | "EXIT" | "BLOCK";

export interface PaperEngineCandidate {
  symbol: string;
  opportunityId: string;
  action: string;
  notional: number;
  price: number;
  heldQty?: number;
}

export interface PaperEngineIntent {
  side: "buy" | "sell";
  quantity: number;
  idempotencyKey: string;
}

const BUY_ACTIONS = new Set(["PRESS", "WAVE_ACTIVE", "GEM_WATCH", "WATCH"]);

export function paperEngineEnabled() {
  const flag = process.env.PAPER_ENGINE;
  if (flag === "0" || flag === "false") return false;
  return true;
}

export function paperOrderQuantity(notional: number, price: number, scale = 1) {
  if (!Number.isFinite(notional) || !Number.isFinite(price) || notional <= 0 || price <= 0) return 0;
  const scaled = notional * Math.max(0, scale);
  if (scaled < price) return 0;
  return Math.floor(scaled / price);
}

function knownAction(action: string): PaperEngineAction | null {
  switch (action) {
    case "PRESS":
    case "WAVE_ACTIVE":
    case "GEM_WATCH":
    case "WATCH":
    case "REDUCE":
    case "EXIT":
    case "BLOCK":
      return action;
    default:
      return null;
  }
}

export function paperEngineIntent(candidate: PaperEngineCandidate): PaperEngineIntent | null {
  const heldQty = Math.max(0, Number(candidate.heldQty ?? 0));
  const action = knownAction(candidate.action);
  if (!action) return null;
  let side: "buy" | "sell" | null = null;
  let scale = 1;
  switch (action) {
    case "PRESS":
    case "WAVE_ACTIVE":
    case "GEM_WATCH":
    case "WATCH":
      side = "buy";
      scale = 1;
      break;
    case "REDUCE":
      side = heldQty > 0 ? "sell" : null;
      scale = 0.5;
      break;
    case "EXIT":
      side = heldQty > 0 ? "sell" : null;
      scale = 1;
      break;
    case "BLOCK":
      side = null;
      break;
    default: {
      const unexpected: never = action;
      void unexpected;
      side = null;
    }
  }
  if (!side) return null;
  const quantity = side === "sell" && action === "EXIT"
    ? Math.floor(heldQty)
    : side === "sell"
      ? Math.floor(heldQty * scale)
      : paperOrderQuantity(candidate.notional, candidate.price, scale);
  if (quantity <= 0) return null;
  const idempotencyKey = `paper-engine.${candidate.opportunityId}.${side}`;
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) return null;
  return { side, quantity, idempotencyKey };
}

export async function runPaperEngine(input?: { positions?: Array<Record<string, unknown>> }) {
  const disabled = {
    ok: true as const,
    status: "skipped" as const,
    reason: "paper_engine_disabled" as const,
    capitalExecutionEnabled: false as const,
    brokerConnected: false as const,
    submitted: 0,
    filled: 0,
    rejected: 0,
    skipped: 0,
  };
  if (!paperEngineEnabled()) return disabled;
  if (process.env.AUTONOMY_HALT === "1" || process.env.AUTONOMY_HALT === "true") {
    return { ...disabled, reason: "autonomy_halt" as const };
  }
  const sql = getSql();
  if (!sql) {
    return { ok: false as const, status: "skipped" as const, reason: "database_not_configured" as const, capitalExecutionEnabled: false as const, brokerConnected: false as const, submitted: 0, filled: 0, rejected: 0, skipped: 0 };
  }

  const maxOrders = Math.max(1, Math.min(25, Number(process.env.PAPER_ENGINE_MAX_ORDERS ?? 8)));
  const positions = input?.positions ?? [];
  const staged: PaperEngineCandidate[] = [];
  for (const position of positions) {
    const action = String(position.action ?? "");
    if (!BUY_ACTIONS.has(action)) continue;
    const symbol = String(position.symbol ?? "").toUpperCase();
    const opportunityId = String(position.opportunityId ?? "");
    const notional = Number(position.notional ?? 0);
    const price = Number(position.price ?? 0);
    if (!symbol || !opportunityId) continue;
    staged.push({ symbol, opportunityId, action, notional, price: Number.isFinite(price) ? price : 0 });
  }
  const histories = await loadDailyHistory(staged.map((candidate) => candidate.symbol));
  const pushes = await loadPricePush(staged.map((candidate) => candidate.symbol));
  const buys: PaperEngineCandidate[] = [];
  for (const candidate of staged) {
    const bars = histories.get(candidate.symbol) ?? [];
    const push = pushes.get(candidate.symbol);
    const rise = applyPricePush(summarizePriceHistory(candidate.price, bars).rise, push ?? EMPTY_PRICE_PUSH);
    if (!screenPaperBuy({ symbol: candidate.symbol, price: candidate.price, room: rise.room }).pass) continue;
    buys.push(candidate);
  }

  const exits = await sql<{ symbol: string; opportunity_id: string; action: string; quantity: number; price: number }[]>`
    select s.symbol, o.id as opportunity_id, o.action, pp.quantity::float as quantity, coalesce(latest.price, pp.average_cost)::float as price
    from paper_positions pp
    join securities s on s.id = pp.security_id
    join lateral (
      select id, action from opportunities
      where security_id = pp.security_id
      order by observed_at desc
      limit 1
    ) o on true
    left join lateral (
      select price from market_snapshots where security_id = pp.security_id order by observed_at desc limit 1
    ) latest on true
    where pp.account_id = 'paper:primary' and pp.quantity > 0 and o.action in ('EXIT', 'REDUCE')
  `;

  const candidates: PaperEngineCandidate[] = [
    ...exits.map((row) => ({
      symbol: row.symbol,
      opportunityId: row.opportunity_id,
      action: row.action,
      notional: Number(row.price) * Number(row.quantity),
      price: Number(row.price),
      heldQty: Number(row.quantity),
    })),
    ...buys,
  ];

  let submitted = 0;
  let filled = 0;
  let rejected = 0;
  let skipped = 0;
  const orders: Array<Record<string, unknown>> = [];

  for (const candidate of candidates) {
    if (submitted >= maxOrders) break;
    const intent = paperEngineIntent(candidate);
    if (!intent) {
      skipped += 1;
      continue;
    }
    const [existing] = await sql<{ id: string }[]>`select id from paper_orders where idempotency_key=${intent.idempotencyKey} limit 1`;
    if (existing) {
      skipped += 1;
      continue;
    }
    const result = await submitPaperOrder({
      symbol: candidate.symbol,
      side: intent.side,
      quantity: intent.quantity,
      orderType: "market",
      pricingMode: "auto",
      timeInForce: "day",
      idempotencyKey: intent.idempotencyKey,
      thesis: intent.side === "buy"
        ? "Paper engine bought a penny name marked rise-with-room."
        : "Paper engine translated a shadow exit into a virtual order.",
      riskNotes: "Virtual ledger only. Broker is not connected.",
    });
    submitted += 1;
    const status = String(result.body.status ?? "");
    if (result.body.ok && (status === "filled" || status === "open")) filled += 1;
    else rejected += 1;
    orders.push({
      symbol: candidate.symbol,
      side: intent.side,
      quantity: intent.quantity,
      status: result.status,
      error: result.body.error ?? null,
      orderId: result.body.orderId ?? null,
    });
  }

  return {
    ok: true as const,
    status: rejected > 0 && filled === 0 ? "degraded" as const : "completed" as const,
    capitalExecutionEnabled: false as const,
    brokerConnected: false as const,
    enabled: true as const,
    submitted,
    filled,
    rejected,
    skipped,
    orders,
  };
}
