import { randomUUID } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { getSql } from '@/lib/db';
import { clampSimulatedFillPrice, simulateExecution } from '@/lib/execution/simulator';
import { DEFAULT_PAPER_ACCOUNT_ID } from '@/lib/paper/account';
import { toJsonb } from '@/lib/db/json';

/**
 * The resting-order engine.
 *
 * A limit order that does not cross at submission is written as `open`. Until
 * now nothing ever looked at it again: it could not fill, it reserved no cash,
 * and its time-in-force was stored but never honoured, so reported buying power
 * was overstated and `day` meant the same thing as `gtc`. This module is the
 * missing half of the order lifecycle and runs on every intelligence cycle.
 */

/** Either a pooled client or a transaction: both carry the tagged-template call. */
type Tx = Sql<Record<string, never>> | TransactionSql<Record<string, never>>;

export const OPEN_STATUSES = ['open', 'pending', 'partially_filled'] as const;

export function crossesLimit(side: 'buy' | 'sell', limitPrice: number, referencePrice: number) {
  return side === 'buy' ? limitPrice >= referencePrice : limitPrice <= referencePrice;
}

/**
 * A `day` order is good for the UTC calendar day it was submitted on. Mercury
 * has no exchange calendar, so the boundary is stated in the term everything
 * else in the warehouse is stamped in rather than guessed from a venue.
 */
export function dayOrderExpired(createdAt: Date | string, now: Date = new Date()) {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return created.toISOString().slice(0, 10) < now.toISOString().slice(0, 10);
}

/**
 * Cash already committed by resting buy orders. Buying power that ignores this
 * lets the same dollar back an unlimited number of open orders.
 */
export async function reservedCashFor(tx: Tx) {
  const [row] = await tx`
    select coalesce(sum((requested_qty - filled_qty) * requested_price), 0)::float as reserved
    from paper_orders
    where side = 'buy'
      and status in ('open','pending','partially_filled')
      and requested_price is not null
  `;
  return Number(row?.reserved ?? 0);
}

/** Apply a fill to positions, cash and realised P&L. Returns the realised amount. */
async function applyFillToBook(tx: Tx, params: {
  accountId: string;
  securityId: string;
  side: 'buy' | 'sell';
  quantity: number;
  fillPrice: number;
  feeAmount: number;
  currentQty: number;
  currentAvg: number;
}) {
  const { accountId, securityId, side, quantity, fillPrice, feeAmount, currentQty, currentAvg } = params;
  if (side === 'buy') {
    const newQty = currentQty + quantity;
    const newAvg = newQty > 0 ? ((currentQty * currentAvg) + (quantity * fillPrice)) / newQty : 0;
    await tx`insert into paper_positions(id,account_id,security_id,quantity,average_cost,realized_pnl) values(${`pos:${accountId}:${securityId}`},${accountId},${securityId},${newQty},${newAvg},0) on conflict(account_id,security_id) do update set quantity=${newQty},average_cost=${newAvg},updated_at=now()`;
    await tx`update paper_accounts set cash=cash-${quantity * fillPrice + feeAmount},updated_at=now() where id=${accountId}`;
    return 0;
  }
  const proceeds = quantity * fillPrice;
  const realized = (fillPrice - currentAvg) * quantity - feeAmount;
  await tx`update paper_positions set quantity=${currentQty - quantity},realized_pnl=realized_pnl+${realized},updated_at=now() where account_id=${accountId} and security_id=${securityId}`;
  await tx`update paper_accounts set cash=cash+${proceeds - feeAmount},realized_pnl=realized_pnl+${realized},updated_at=now() where id=${accountId}`;
  return realized;
}

/** Mark the account to market and persist an equity snapshot. */
async function snapshotAccount(tx: Tx, accountId: string, metadata: Record<string, unknown>) {
  const [postAccount] = await tx`select cash,realized_pnl from paper_accounts where id=${accountId}`;
  const [marking] = await tx`select coalesce(sum(pp.quantity * coalesce(latest.price,pp.average_cost)),0) as market_value, coalesce(sum(pp.quantity * (coalesce(latest.price,pp.average_cost)-pp.average_cost)),0) as unrealized_pnl, count(*) filter(where pp.quantity>0)::int as position_count from paper_positions pp left join lateral (select price from market_snapshots ms where ms.security_id=pp.security_id order by observed_at desc limit 1) latest on true where pp.account_id=${accountId}`;
  const cash = Number(postAccount?.cash ?? 0);
  const marketValue = Number(marking?.market_value ?? 0);
  await tx`insert into paper_account_snapshots(id,account_id,cash,market_value,equity,realized_pnl,unrealized_pnl,gross_exposure,position_count,metadata) values(${`paper-snapshot:${randomUUID()}`},${accountId},${cash},${marketValue},${cash + marketValue},${Number(postAccount?.realized_pnl ?? 0)},${Number(marking?.unrealized_pnl ?? 0)},${marketValue},${Number(marking?.position_count ?? 0)},${toJsonb(metadata)}::jsonb)`;
}

export interface RestingOrderOutcome {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  action: 'filled' | 'expired' | 'rejected' | 'resting';
  reason: string | null;
  fillPrice: number | null;
  referencePrice: number | null;
}

export interface RestingSweepResult {
  ok: boolean;
  reason?: string;
  evaluated: number;
  filled: number;
  expired: number;
  rejected: number;
  stillResting: number;
  reservedCash: number;
  outcomes: RestingOrderOutcome[];
  shadowOnly: true;
  capitalExecutionEnabled: false;
}

/**
 * Re-evaluate every resting order against the newest market data.
 *
 * An order only fills on a snapshot observed *after* it was submitted: resting
 * against data that already existed when the order was written would let it
 * fill on the tick it deliberately did not cross. A `day` order that never
 * crossed before its session ended is cancelled rather than carried forward.
 */
export async function settleRestingOrders(now: Date = new Date(), limit = 500): Promise<RestingSweepResult> {
  const sql = getSql();
  const empty = { evaluated: 0, filled: 0, expired: 0, rejected: 0, stillResting: 0, reservedCash: 0, outcomes: [], shadowOnly: true as const, capitalExecutionEnabled: false as const };
  if (!sql) return { ok: false, reason: 'database_not_configured', ...empty };

  try {
    return await sql.begin(async (tx) => {
      const accountId = DEFAULT_PAPER_ACCOUNT_ID;
      await tx`select id from paper_accounts where id=${accountId} for update`;

      const orders = await tx`
        select po.id, po.security_id, po.side, po.requested_qty, po.filled_qty, po.requested_price,
               po.order_type, po.time_in_force, po.created_at, s.symbol, s.market
        from paper_orders po
        join securities s on s.id = po.security_id
        where po.status in ('open','pending','partially_filled')
        order by po.created_at asc
        limit ${Math.max(1, Math.min(2000, limit))}
        for update of po
      `;

      const outcomes: RestingOrderOutcome[] = [];
      const commissionBps = Math.max(0, Number(process.env.PAPER_COMMISSION_BPS ?? 0));
      let filledCount = 0;

      for (const order of orders) {
        const orderId = String(order.id);
        const side = String(order.side) as 'buy' | 'sell';
        const symbol = String(order.symbol);
        const remaining = Number(order.requested_qty) - Number(order.filled_qty ?? 0);
        const limitPrice = order.requested_price == null ? null : Number(order.requested_price);
        const eventId = () => `paper-event:${randomUUID()}`;

        const [snapshot] = await tx`
          select price,bid,ask,spread_bps,dollar_volume,rvol,float_rotation,observed_at
          from market_snapshots
          where security_id=${order.security_id} and observed_at > ${order.created_at}
          order by observed_at desc limit 1
        `;

        const expire = async (reason: string) => {
          await tx`update paper_orders set status='cancelled',cancelled_at=now(),updated_at=now() where id=${orderId}`;
          await tx`insert into paper_order_events(id,order_id,event_type,status,detail) values(${eventId()},${orderId},'expired','cancelled',${toJsonb({ reason, timeInForce: order.time_in_force, capitalExecutionEnabled: false })}::jsonb)`;
          await tx`update paper_trade_journal set outcome=outcome || ${toJsonb({ status: 'expired', reason })}::jsonb,updated_at=now() where order_id=${orderId}`;
          outcomes.push({ orderId, symbol, side, action: 'expired', reason, fillPrice: null, referencePrice: null });
        };

        if (!snapshot) {
          if (String(order.time_in_force) === 'day' && dayOrderExpired(order.created_at as Date, now)) await expire('day_order_session_ended');
          else outcomes.push({ orderId, symbol, side, action: 'resting', reason: 'no_market_data_since_submission', fillPrice: null, referencePrice: null });
          continue;
        }

        const mark = Number(snapshot.price);
        const sidePrice = side === 'buy' ? Number(snapshot.ask ?? snapshot.price) : Number(snapshot.bid ?? snapshot.price);
        const referencePrice = Number.isFinite(sidePrice) && sidePrice > 0 ? sidePrice : mark;

        if (limitPrice != null && !crossesLimit(side, limitPrice, referencePrice)) {
          if (String(order.time_in_force) === 'day' && dayOrderExpired(order.created_at as Date, now)) await expire('day_order_session_ended');
          else outcomes.push({ orderId, symbol, side, action: 'resting', reason: 'limit_not_crossed', fillPrice: null, referencePrice });
          continue;
        }

        const notional = remaining * referencePrice;
        const simulation = simulateExecution({ notional, price: referencePrice, dollarVolume: Number(snapshot.dollar_volume ?? 0), spreadBps: Number(snapshot.spread_bps ?? 0), rvol: Number(snapshot.rvol ?? 1), floatRotation: Number(snapshot.float_rotation ?? 0) });
        const slip = simulation.estimatedOneWayCostBps / 10_000;
        const slipped = side === 'buy' ? referencePrice * (1 + slip) : referencePrice * (1 - slip);
        const fillPrice = clampSimulatedFillPrice(limitPrice == null ? 'market' : 'limit', side, slipped, limitPrice ?? referencePrice);
        const feeAmount = Number((notional * commissionBps / 10_000).toFixed(6));

        const [position] = await tx`select quantity,average_cost from paper_positions where account_id=${accountId} and security_id=${order.security_id} for update`;
        const currentQty = Number(position?.quantity ?? 0);
        const currentAvg = Number(position?.average_cost ?? 0);
        const [account] = await tx`select cash from paper_accounts where id=${accountId}`;
        const cash = Number(account?.cash ?? 0);

        // Reservation excludes this order: its own cash is what is being spent.
        const [reservedRow] = await tx`
          select coalesce(sum((requested_qty - filled_qty) * requested_price), 0)::float as reserved
          from paper_orders
          where side='buy' and status in ('open','pending','partially_filled')
            and requested_price is not null and id <> ${orderId}
        `;
        const otherReserved = Number(reservedRow?.reserved ?? 0);

        let rejectReason: string | null = null;
        if (simulation.capacityExceeded) rejectReason = 'liquidity_capacity_exceeded';
        else if (side === 'buy' && cash - otherReserved < remaining * fillPrice + feeAmount) rejectReason = 'insufficient_virtual_cash';
        else if (side === 'sell' && currentQty < remaining) rejectReason = 'insufficient_virtual_position';

        if (rejectReason) {
          await tx`update paper_orders set status='rejected',reject_reason=${rejectReason},updated_at=now() where id=${orderId}`;
          await tx`insert into paper_order_events(id,order_id,event_type,status,detail) values(${eventId()},${orderId},'rejected','rejected',${toJsonb({ reason: rejectReason, referencePrice, settledBy: 'resting-order-engine' })}::jsonb)`;
          await tx`update paper_trade_journal set outcome=outcome || ${toJsonb({ status: 'rejected', reason: rejectReason })}::jsonb,updated_at=now() where order_id=${orderId}`;
          outcomes.push({ orderId, symbol, side, action: 'rejected', reason: rejectReason, fillPrice: null, referencePrice });
          continue;
        }

        await applyFillToBook(tx, { accountId, securityId: String(order.security_id), side, quantity: remaining, fillPrice, feeAmount, currentQty, currentAvg });
        await tx`
          update paper_orders set status='filled', filled_qty=requested_qty, average_fill_price=${fillPrice},
            fee_amount=${feeAmount}, slippage_bps=${simulation.estimatedOneWayCostBps},
            simulation=${toJsonb({ ...simulation, referencePrice, fillPrice, commissionBps, settledBy: 'resting-order-engine', capitalExecutionEnabled: false, brokerConnected: false })}::jsonb,
            updated_at=now()
          where id=${orderId}
        `;
        await tx`insert into paper_order_events(id,order_id,event_type,status,detail) values(${eventId()},${orderId},'filled','filled',${toJsonb({ referencePrice, fillPrice, feeAmount, slippageBps: simulation.estimatedOneWayCostBps, settledBy: 'resting-order-engine', snapshotAt: snapshot.observed_at })}::jsonb)`;
        await tx`update paper_trade_journal set outcome=outcome || ${toJsonb({ status: 'filled', fillPrice, feeAmount, slippageBps: simulation.estimatedOneWayCostBps, settledBy: 'resting-order-engine' })}::jsonb,updated_at=now() where order_id=${orderId}`;
        outcomes.push({ orderId, symbol, side, action: 'filled', reason: null, fillPrice, referencePrice });
        filledCount += 1;
      }

      if (filledCount > 0) await snapshotAccount(tx, accountId, { trigger: 'resting_order_settlement', filled: filledCount });

      const [finalReserved] = await tx`
        select coalesce(sum((requested_qty - filled_qty) * requested_price), 0)::float as reserved
        from paper_orders
        where side='buy' and status in ('open','pending','partially_filled') and requested_price is not null
      `;

      return {
        ok: true,
        evaluated: orders.length,
        filled: filledCount,
        expired: outcomes.filter((o) => o.action === 'expired').length,
        rejected: outcomes.filter((o) => o.action === 'rejected').length,
        stillResting: outcomes.filter((o) => o.action === 'resting').length,
        reservedCash: Number(finalReserved?.reserved ?? 0),
        outcomes,
        shadowOnly: true as const,
        capitalExecutionEnabled: false as const,
      };
    });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'resting_order_settlement_failed', ...empty };
  }
}
