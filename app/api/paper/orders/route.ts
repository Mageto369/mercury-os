import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { simulateExecution } from '@/lib/execution/simulator';
import { DEFAULT_PAPER_ACCOUNT_ID, ensurePaperAccount } from '@/lib/paper/account';
import { adminAuthorized, sameOriginMutation } from '@/lib/admin/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OrderSchema = z.object({
  symbol: z.string().trim().min(1).max(16).transform((v) => v.toUpperCase()),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().positive().max(10_000_000),
  orderType: z.enum(['market', 'limit']).default('market'),
  limitPrice: z.number().positive().optional(),
}).superRefine((value, ctx) => {
  if (value.orderType === 'limit' && value.limitPrice == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['limitPrice'], message: 'Limit price required' });
});

export async function POST(request: Request) {
  if (!sameOriginMutation(request)) return NextResponse.json({ ok:false, error:'origin_mismatch' }, { status:403 });
  if (!adminAuthorized(request)) return NextResponse.json({ ok:false, error:'admin_session_required' }, { status:401 });
  const sql = getSql();
  if (!sql) return NextResponse.json({ ok:false, error:'database_not_configured' }, { status:503 });

  const parsed = OrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok:false, error:'invalid_order', issues:parsed.error.flatten() }, { status:400 });
  const input = parsed.data;

  try {
    await ensurePaperAccount();
    const result = await sql.begin(async (tx) => {
      const [security] = await tx`select id,symbol,market from securities where upper(symbol)=${input.symbol} and active=true and id not like 'validation:%' limit 1`;
      if (!security) return { status:404, body:{ ok:false, error:'security_not_found' } };

      const [snapshot] = await tx`select price,bid,ask,spread_bps,dollar_volume,rvol,float_rotation,observed_at from market_snapshots where security_id=${security.id} order by observed_at desc limit 1`;
      if (!snapshot) return { status:409, body:{ ok:false, error:'market_snapshot_required' } };

      const mark = Number(snapshot.price);
      const sidePrice = input.side === 'buy' ? Number(snapshot.ask ?? snapshot.price) : Number(snapshot.bid ?? snapshot.price);
      const referencePrice = Number.isFinite(sidePrice) && sidePrice > 0 ? sidePrice : mark;
      if (input.orderType === 'limit') {
        const crosses = input.side === 'buy' ? Number(input.limitPrice) >= referencePrice : Number(input.limitPrice) <= referencePrice;
        if (!crosses) return { status:409, body:{ ok:false, error:'limit_not_marketable', referencePrice } };
      }

      const notional = input.quantity * referencePrice;
      const simulation = simulateExecution({
        notional,
        price: referencePrice,
        dollarVolume: Number(snapshot.dollar_volume ?? 0),
        spreadBps: Number(snapshot.spread_bps ?? 0),
        rvol: Number(snapshot.rvol ?? 1),
        floatRotation: Number(snapshot.float_rotation ?? 0),
      });
      const slip = simulation.estimatedOneWayCostBps / 10_000;
      const fillPrice = input.side === 'buy' ? referencePrice * (1 + slip) : referencePrice * (1 - slip);
      const orderId = `paper:${randomUUID()}`;
      const [account] = await tx`select * from paper_accounts where id=${DEFAULT_PAPER_ACCOUNT_ID} for update`;
      const [position] = await tx`select * from paper_positions where account_id=${DEFAULT_PAPER_ACCOUNT_ID} and security_id=${security.id} for update`;
      const currentQty = Number(position?.quantity ?? 0);
      const currentAvg = Number(position?.average_cost ?? 0);
      const currentCash = Number(account?.cash ?? 0);

      let rejectReason: string | null = null;
      if (simulation.capacityExceeded) rejectReason = 'liquidity_capacity_exceeded';
      if (input.side === 'buy' && currentCash < input.quantity * fillPrice) rejectReason = 'insufficient_virtual_cash';
      if (input.side === 'sell' && currentQty < input.quantity) rejectReason = 'insufficient_virtual_position';

      if (rejectReason) {
        await tx`insert into paper_orders(id,security_id,side,requested_qty,filled_qty,requested_price,average_fill_price,status,slippage_bps,reject_reason,simulation,capital_execution_enabled) values(${orderId},${security.id},${input.side},${input.quantity},0,${input.orderType==='limit'?input.limitPrice:referencePrice},null,'rejected',${simulation.estimatedOneWayCostBps},${rejectReason},${tx.json({...simulation,orderType:input.orderType,referencePrice,capitalExecutionEnabled:false})},false)`;
        return { status:409, body:{ ok:false, error:rejectReason, orderId, simulation, capitalExecutionEnabled:false } };
      }

      if (input.side === 'buy') {
        const newQty = currentQty + input.quantity;
        const newAvg = newQty > 0 ? ((currentQty * currentAvg) + (input.quantity * fillPrice)) / newQty : 0;
        await tx`insert into paper_positions(id,account_id,security_id,quantity,average_cost,realized_pnl) values(${`pos:${DEFAULT_PAPER_ACCOUNT_ID}:${security.id}`},${DEFAULT_PAPER_ACCOUNT_ID},${security.id},${newQty},${newAvg},0) on conflict(account_id,security_id) do update set quantity=${newQty},average_cost=${newAvg},updated_at=now()`;
        await tx`update paper_accounts set cash=cash-${input.quantity * fillPrice},updated_at=now() where id=${DEFAULT_PAPER_ACCOUNT_ID}`;
      } else {
        const proceeds = input.quantity * fillPrice;
        const realized = (fillPrice - currentAvg) * input.quantity;
        const newQty = currentQty - input.quantity;
        await tx`update paper_positions set quantity=${newQty},realized_pnl=realized_pnl+${realized},updated_at=now() where account_id=${DEFAULT_PAPER_ACCOUNT_ID} and security_id=${security.id}`;
        await tx`update paper_accounts set cash=cash+${proceeds},realized_pnl=realized_pnl+${realized},updated_at=now() where id=${DEFAULT_PAPER_ACCOUNT_ID}`;
      }

      await tx`insert into paper_orders(id,security_id,side,requested_qty,filled_qty,requested_price,average_fill_price,status,latency_ms,slippage_bps,simulation,capital_execution_enabled) values(${orderId},${security.id},${input.side},${input.quantity},${input.quantity},${input.orderType==='limit'?input.limitPrice:referencePrice},${fillPrice},'filled',0,${simulation.estimatedOneWayCostBps},${tx.json({...simulation,orderType:input.orderType,referencePrice,fillPrice,capitalExecutionEnabled:false,brokerConnected:false})},false)`;
      return { status:200, body:{ ok:true, orderId, symbol:security.symbol, side:input.side, quantity:input.quantity, fillPrice, simulation, capitalExecutionEnabled:false, brokerConnected:false } };
    });
    return NextResponse.json(result.body, { status:result.status });
  } catch (error) {
    return NextResponse.json({ ok:false, error:'paper_order_failed', detail:error instanceof Error?error.message:'unknown_error', capitalExecutionEnabled:false }, { status:500 });
  }
}
