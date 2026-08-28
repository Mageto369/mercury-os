import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getPaperAccountSnapshot } from '@/lib/paper/account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ ok:false, mode:'paper', capitalExecutionEnabled:false, error:'database_not_configured', summary:{orders:0,filled:0,rejected:0,open:0}, orders:[], account:null }, { status:503 });
  }

  try {
    const [summary] = await sql`select count(*)::int as orders, count(*) filter (where status in ('filled','simulated','partially_filled'))::int as filled, count(*) filter (where status='rejected')::int as rejected, count(*) filter (where status in ('pending','open','partially_filled'))::int as open from paper_orders`;
    const orders = await sql`
      select po.id,s.symbol,s.market,po.opportunity_id,po.side,po.requested_qty,po.filled_qty,po.requested_price,po.average_fill_price,po.status,po.latency_ms,po.slippage_bps,po.reject_reason,po.simulation,po.created_at
      from paper_orders po join securities s on s.id=po.security_id
      where s.id not like 'validation:%' order by po.created_at desc limit 100
    `;
    const [latestDecision] = await sql`select observed_at,decision,target_weight,max_weight,liquidity_capacity,reasons from portfolio_decisions where shadow_only=true and capital_execution_enabled=false order by observed_at desc limit 1`;
    const account = await getPaperAccountSnapshot();

    return NextResponse.json({
      ok:true, mode:'paper', evidenceScope:'live-only', capitalExecutionEnabled:false, brokerConnected:false,
      summary:{orders:Number(summary?.orders??0),filled:Number(summary?.filled??0),rejected:Number(summary?.rejected??0),open:Number(summary?.open??0)},
      orders, latestPortfolioDecision:latestDecision??null, account,
    });
  } catch (error) {
    return NextResponse.json({ ok:false, mode:'paper', capitalExecutionEnabled:false, error:'paper_terminal_query_failed', detail:error instanceof Error?error.message:'unknown_error', summary:{orders:0,filled:0,rejected:0,open:0}, orders:[], account:null }, { status:500 });
  }
}
