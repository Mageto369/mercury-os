import { createHash, randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { toJsonb } from "@/lib/db/json";
import { executionQuoteAssumptions } from "@/lib/execution/quote-assumptions";
import {
  clampSimulatedFillPrice,
  simulateExecution,
} from "@/lib/execution/simulator";
import {
  DEFAULT_PAPER_ACCOUNT_ID,
  ensurePaperAccount,
} from "@/lib/paper/account";
import { reservedCashFor, toLedgerAmount } from "@/lib/paper/order-engine";
import {
  selectPaperQuote,
  type PaperPricingMode,
  type PaperQuoteSnapshot,
} from "@/lib/paper/quote-policy";

export interface PaperOrderRequest {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  orderType?: "market" | "limit";
  limitPrice?: number;
  timeInForce?: "day" | "gtc";
  pricingMode?: PaperPricingMode;
  thesis?: string;
  catalyst?: string;
  riskNotes?: string;
  idempotencyKey: string;
}

export interface PaperOrderResult {
  status: number;
  body: Record<string, unknown>;
}

function replayOrder(order: Record<string, unknown>): PaperOrderResult {
  const status = String(order.status);
  const rejected = status === "rejected";
  return {
    status: rejected ? 409 : status === "open" ? 202 : 200,
    body: {
      ok: !rejected,
      error: rejected
        ? String(order.reject_reason ?? "paper_order_rejected")
        : undefined,
      orderId: String(order.id),
      status,
      side: String(order.side),
      quantity: Number(order.requested_qty),
      requestedPrice:
        order.requested_price == null ? null : Number(order.requested_price),
      fillPrice:
        order.average_fill_price == null
          ? null
          : Number(order.average_fill_price),
      feeAmount: Number(order.fee_amount ?? 0),
      simulation: order.simulation,
      idempotentReplay: true,
      capitalExecutionEnabled: false,
      brokerConnected: false,
    },
  };
}

export async function submitPaperOrder(request: PaperOrderRequest): Promise<PaperOrderResult> {
  const sql = getSql();
  if (!sql) {
    return {
      status: 503,
      body: { ok: false, error: "database_not_configured", capitalExecutionEnabled: false, brokerConnected: false },
    };
  }

  const input = {
    symbol: request.symbol.trim().toUpperCase(),
    side: request.side,
    quantity: request.quantity,
    orderType: request.orderType ?? "market",
    limitPrice: request.limitPrice,
    timeInForce: request.timeInForce ?? "day",
    pricingMode: request.pricingMode ?? "auto",
    thesis: request.thesis,
    catalyst: request.catalyst,
    riskNotes: request.riskNotes,
  };
  const idempotencyKey = request.idempotencyKey;
  const requestFingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");

  await ensurePaperAccount();
  return sql.begin(async (tx) => {
    const [security] =
      await tx`select id,symbol,market from securities where upper(symbol)=${input.symbol} and active=true and id not like 'validation:%' limit 1`;
    if (!security) return { status: 404, body: { ok: false, error: "security_not_found", capitalExecutionEnabled: false, brokerConnected: false } };

    const [opportunity] =
      await tx`select id,state,observed_at from opportunities where security_id=${security.id} order by observed_at desc limit 1`;
    const snapshots =
      await tx`select price,bid,ask,spread_bps,dollar_volume,rvol,float_rotation,observed_at,payload from market_snapshots where security_id=${security.id} order by observed_at desc limit 50`;
    const quote = selectPaperQuote(snapshots as unknown as PaperQuoteSnapshot[], input.pricingMode);
    const snapshot = quote.snapshot as Record<string, unknown> | null;
    if (!snapshot) {
      return {
        status: 409,
        body: { ok: false, error: quote.decision.reason ?? "market_snapshot_required", quote: quote.decision, capitalExecutionEnabled: false, brokerConnected: false },
      };
    }

    const mark = Number(snapshot.price);
    const sidePrice = input.side === "buy" ? Number(snapshot.ask ?? snapshot.price) : Number(snapshot.bid ?? snapshot.price);
    const referencePrice = Number.isFinite(sidePrice) && sidePrice > 0 ? sidePrice : mark;
    const requestedPrice = input.orderType === "limit" ? Number(input.limitPrice) : referencePrice;
    const notional = input.quantity * referencePrice;
    const assumptions = executionQuoteAssumptions(snapshot);
    const executionEstimate = simulateExecution({
      notional,
      price: referencePrice,
      dollarVolume: Number(snapshot.dollar_volume ?? 0),
      spreadBps: assumptions.spreadBps,
      rvol: assumptions.rvol,
      floatRotation: assumptions.floatRotation,
    });
    const simulation = { ...executionEstimate, assumptions, quote: quote.decision, requestedPricingMode: input.pricingMode, pricingMode: quote.decision.pricingMode };
    const slip = simulation.estimatedOneWayCostBps / 10_000;
    const slippedPrice = input.side === "buy" ? referencePrice * (1 + slip) : referencePrice * (1 - slip);
    const fillPrice = clampSimulatedFillPrice(input.orderType, input.side, slippedPrice, requestedPrice);
    const orderId = `paper:${randomUUID()}`;
    const eventId = () => `paper-event:${randomUUID()}`;
    const journalId = `paper-journal:${randomUUID()}`;
    const commissionBps = Math.max(0, Number(process.env.PAPER_COMMISSION_BPS ?? 0));
    const feeAmount = Number(((notional * commissionBps) / 10_000).toFixed(6));

    const [account] = await tx`select * from paper_accounts where id=${DEFAULT_PAPER_ACCOUNT_ID} for update`;
    const [existing] =
      await tx`select id,security_id,side,requested_qty,requested_price,average_fill_price,status,order_type,time_in_force,fee_amount,reject_reason,simulation,request_fingerprint from paper_orders where idempotency_key=${idempotencyKey} limit 1`;
    if (existing) {
      if (String(existing.request_fingerprint) !== requestFingerprint) {
        return {
          status: 409,
          body: { ok: false, error: "idempotency_key_reused", orderId: String(existing.id), capitalExecutionEnabled: false, brokerConnected: false },
        };
      }
      return replayOrder(existing as Record<string, unknown>);
    }
    const [position] =
      await tx`select * from paper_positions where account_id=${DEFAULT_PAPER_ACCOUNT_ID} and security_id=${security.id} for update`;
    const currentQty = Number(position?.quantity ?? 0);
    const currentAvg = Number(position?.average_cost ?? 0);
    const reservedCash = await reservedCashFor(tx);
    const currentCash = Number(account?.cash ?? 0) - reservedCash;

    if (input.orderType === "limit") {
      const crosses = input.side === "buy" ? requestedPrice >= referencePrice : requestedPrice <= referencePrice;
      if (!crosses) {
        const restingReason =
          input.side === "buy" && currentCash < input.quantity * requestedPrice
            ? "insufficient_virtual_cash"
            : input.side === "sell" && currentQty < input.quantity
              ? "insufficient_virtual_position"
              : null;
        if (restingReason) {
          await tx`insert into paper_orders(id,security_id,opportunity_id,side,requested_qty,filled_qty,requested_price,status,order_type,time_in_force,reject_reason,simulation,capital_execution_enabled,idempotency_key,request_fingerprint) values(${orderId},${security.id},${opportunity?.id ?? null},${input.side},${input.quantity},0,${requestedPrice},'rejected',${input.orderType},${input.timeInForce},${restingReason},${toJsonb({ ...simulation, referencePrice, capitalExecutionEnabled: false })}::jsonb,false,${idempotencyKey},${requestFingerprint})`;
          await tx`insert into paper_order_events(id,order_id,event_type,status,detail) values(${eventId()},${orderId},'rejected','rejected',${toJsonb({ reason: restingReason, referencePrice, requestedPrice })}::jsonb)`;
          await tx`insert into paper_trade_journal(id,order_id,security_id,opportunity_id,thesis,catalyst,risk_notes,context,outcome) values(${journalId},${orderId},${security.id},${opportunity?.id ?? null},${input.thesis ?? null},${input.catalyst ?? null},${input.riskNotes ?? null},${toJsonb({ symbol: security.symbol, market: security.market, orderType: input.orderType, side: input.side, quantity: input.quantity, referencePrice, snapshotAt: snapshot.observed_at })}::jsonb,${toJsonb({ status: "rejected", reason: restingReason })}::jsonb)`;
          return { status: 409, body: { ok: false, error: restingReason, orderId, simulation, capitalExecutionEnabled: false, brokerConnected: false } };
        }
        await tx`insert into paper_orders(id,security_id,opportunity_id,side,requested_qty,filled_qty,requested_price,status,order_type,time_in_force,simulation,capital_execution_enabled,idempotency_key,request_fingerprint) values(${orderId},${security.id},${opportunity?.id ?? null},${input.side},${input.quantity},0,${requestedPrice},'open',${input.orderType},${input.timeInForce},${toJsonb({ ...simulation, referencePrice, capitalExecutionEnabled: false, brokerConnected: false })}::jsonb,false,${idempotencyKey},${requestFingerprint})`;
        await tx`insert into paper_order_events(id,order_id,event_type,status,detail) values(${eventId()},${orderId},'accepted','open',${toJsonb({ referencePrice, requestedPrice, timeInForce: input.timeInForce })}::jsonb)`;
        await tx`insert into paper_trade_journal(id,order_id,security_id,opportunity_id,thesis,catalyst,risk_notes,context) values(${journalId},${orderId},${security.id},${opportunity?.id ?? null},${input.thesis ?? null},${input.catalyst ?? null},${input.riskNotes ?? null},${toJsonb({ symbol: security.symbol, market: security.market, orderType: input.orderType, side: input.side, quantity: input.quantity, referencePrice, snapshotAt: snapshot.observed_at, opportunityState: opportunity?.state ?? null })}::jsonb)`;
        return {
          status: 202,
          body: {
            ok: true,
            orderId,
            status: "open",
            symbol: security.symbol,
            side: input.side,
            quantity: input.quantity,
            requestedPrice,
            timeInForce: input.timeInForce,
            simulation,
            capitalExecutionEnabled: false,
            brokerConnected: false,
          },
        };
      }
    }

    let rejectReason: string | null = null;
    if (simulation.capacityExceeded) rejectReason = "liquidity_capacity_exceeded";
    if (input.side === "buy" && currentCash < input.quantity * fillPrice + feeAmount) rejectReason = "insufficient_virtual_cash";
    if (input.side === "sell" && currentQty < input.quantity) rejectReason = "insufficient_virtual_position";

    if (rejectReason) {
      await tx`insert into paper_orders(id,security_id,opportunity_id,side,requested_qty,filled_qty,requested_price,average_fill_price,status,order_type,time_in_force,fee_amount,slippage_bps,reject_reason,simulation,capital_execution_enabled,idempotency_key,request_fingerprint) values(${orderId},${security.id},${opportunity?.id ?? null},${input.side},${input.quantity},0,${requestedPrice},null,'rejected',${input.orderType},${input.timeInForce},0,${simulation.estimatedOneWayCostBps},${rejectReason},${toJsonb({ ...simulation, referencePrice, capitalExecutionEnabled: false })}::jsonb,false,${idempotencyKey},${requestFingerprint})`;
      await tx`insert into paper_order_events(id,order_id,event_type,status,detail) values(${eventId()},${orderId},'rejected','rejected',${toJsonb({ reason: rejectReason, referencePrice })}::jsonb)`;
      await tx`insert into paper_trade_journal(id,order_id,security_id,opportunity_id,thesis,catalyst,risk_notes,context,outcome) values(${journalId},${orderId},${security.id},${opportunity?.id ?? null},${input.thesis ?? null},${input.catalyst ?? null},${input.riskNotes ?? null},${toJsonb({ symbol: security.symbol, market: security.market, orderType: input.orderType, side: input.side, quantity: input.quantity, referencePrice, snapshotAt: snapshot.observed_at })}::jsonb,${toJsonb({ status: "rejected", reason: rejectReason })}::jsonb)`;
      return { status: 409, body: { ok: false, error: rejectReason, orderId, simulation, capitalExecutionEnabled: false, brokerConnected: false } };
    }

    if (input.side === "buy") {
      const newQty = currentQty + input.quantity;
      const newAvg = newQty > 0 ? (currentQty * currentAvg + input.quantity * fillPrice) / newQty : 0;
      await tx`insert into paper_positions(id,account_id,security_id,quantity,average_cost,realized_pnl) values(${`pos:${DEFAULT_PAPER_ACCOUNT_ID}:${security.id}`},${DEFAULT_PAPER_ACCOUNT_ID},${security.id},${newQty},${newAvg},0) on conflict(account_id,security_id) do update set quantity=${newQty},average_cost=${newAvg},updated_at=now()`;
      await tx`update paper_accounts set cash=cash-${toLedgerAmount(input.quantity * fillPrice + feeAmount)},updated_at=now() where id=${DEFAULT_PAPER_ACCOUNT_ID}`;
    } else {
      const proceeds = toLedgerAmount(input.quantity * fillPrice - feeAmount);
      const realized = toLedgerAmount((fillPrice - currentAvg) * input.quantity - feeAmount);
      const newQty = currentQty - input.quantity;
      await tx`update paper_positions set quantity=${newQty},realized_pnl=realized_pnl+${realized},updated_at=now() where account_id=${DEFAULT_PAPER_ACCOUNT_ID} and security_id=${security.id}`;
      await tx`update paper_accounts set cash=cash+${proceeds},realized_pnl=realized_pnl+${realized},updated_at=now() where id=${DEFAULT_PAPER_ACCOUNT_ID}`;
    }

    await tx`insert into paper_orders(id,security_id,opportunity_id,side,requested_qty,filled_qty,requested_price,average_fill_price,status,order_type,time_in_force,fee_amount,latency_ms,slippage_bps,simulation,capital_execution_enabled,idempotency_key,request_fingerprint) values(${orderId},${security.id},${opportunity?.id ?? null},${input.side},${input.quantity},${input.quantity},${requestedPrice},${fillPrice},'filled',${input.orderType},${input.timeInForce},${feeAmount},0,${simulation.estimatedOneWayCostBps},${toJsonb({ ...simulation, referencePrice, fillPrice, commissionBps, capitalExecutionEnabled: false, brokerConnected: false })}::jsonb,false,${idempotencyKey},${requestFingerprint})`;
    await tx`insert into paper_order_events(id,order_id,event_type,status,detail) values(${eventId()},${orderId},'filled','filled',${toJsonb({ referencePrice, fillPrice, feeAmount, slippageBps: simulation.estimatedOneWayCostBps })}::jsonb)`;
    await tx`insert into paper_trade_journal(id,order_id,security_id,opportunity_id,thesis,catalyst,risk_notes,context,outcome) values(${journalId},${orderId},${security.id},${opportunity?.id ?? null},${input.thesis ?? null},${input.catalyst ?? null},${input.riskNotes ?? null},${toJsonb({ symbol: security.symbol, market: security.market, orderType: input.orderType, side: input.side, quantity: input.quantity, referencePrice, snapshotAt: snapshot.observed_at, opportunityState: opportunity?.state ?? null })}::jsonb,${toJsonb({ status: "filled", fillPrice, feeAmount, slippageBps: simulation.estimatedOneWayCostBps })}::jsonb)`;

    const [postAccount] = await tx`select cash,realized_pnl from paper_accounts where id=${DEFAULT_PAPER_ACCOUNT_ID}`;
    const [marking] =
      await tx`select coalesce(sum(pp.quantity * coalesce(latest.price,pp.average_cost)),0) as market_value, coalesce(sum(pp.quantity * (coalesce(latest.price,pp.average_cost)-pp.average_cost)),0) as unrealized_pnl, count(*) filter(where pp.quantity>0)::int as position_count from paper_positions pp left join lateral (select price from market_snapshots ms where ms.security_id=pp.security_id order by observed_at desc limit 1) latest on true where pp.account_id=${DEFAULT_PAPER_ACCOUNT_ID}`;
    const cash = Number(postAccount?.cash ?? 0);
    const marketValue = Number(marking?.market_value ?? 0);
    const unrealizedPnl = Number(marking?.unrealized_pnl ?? 0);
    const realizedPnl = Number(postAccount?.realized_pnl ?? 0);
    await tx`insert into paper_account_snapshots(id,account_id,cash,market_value,equity,realized_pnl,unrealized_pnl,gross_exposure,position_count,metadata) values(${`paper-snapshot:${randomUUID()}`},${DEFAULT_PAPER_ACCOUNT_ID},${cash},${marketValue},${cash + marketValue},${realizedPnl},${unrealizedPnl},${marketValue},${Number(marking?.position_count ?? 0)},${toJsonb({ trigger: "order_fill", orderId })}::jsonb)`;

    return {
      status: 200,
      body: {
        ok: true,
        orderId,
        status: "filled",
        symbol: security.symbol,
        side: input.side,
        quantity: input.quantity,
        fillPrice,
        feeAmount,
        simulation,
        capitalExecutionEnabled: false,
        brokerConnected: false,
      },
    };
  });
}
