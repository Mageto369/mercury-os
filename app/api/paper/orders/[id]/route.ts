import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { adminAuthorized, sameOriginMutation } from '@/lib/admin/security';
import { toJsonb } from '@/lib/db/json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOriginMutation(request)) return NextResponse.json({ ok:false,error:'origin_mismatch' },{status:403});
  if (!adminAuthorized(request)) return NextResponse.json({ ok:false,error:'admin_session_required' },{status:401});
  const sql=getSql(); if(!sql) return NextResponse.json({ok:false,error:'database_not_configured'},{status:503});
  const {id}=await context.params;
  try {
    const result=await sql.begin(async tx=>{
      const [order]=await tx`select id,status,filled_qty from paper_orders where id=${id} for update`;
      if(!order) return {status:404,body:{ok:false,error:'paper_order_not_found'}};
      if(!['open','pending','partially_filled'].includes(String(order.status))) return {status:409,body:{ok:false,error:'paper_order_not_cancellable',status:order.status}};
      await tx`update paper_orders set status='cancelled',cancelled_at=now(),updated_at=now() where id=${id}`;
      await tx`insert into paper_order_events(id,order_id,event_type,status,detail) values(${`paper-event:${randomUUID()}`},${id},'cancelled','cancelled',${toJsonb({filledQty:Number(order.filled_qty??0),capitalExecutionEnabled:false})}::jsonb)`;
      await tx`update paper_trade_journal set outcome=outcome || ${toJsonb({status:'cancelled'})}::jsonb,updated_at=now() where order_id=${id}`;
      return {status:200,body:{ok:true,orderId:id,status:'cancelled',capitalExecutionEnabled:false,brokerConnected:false}};
    });
    return NextResponse.json(result.body,{status:result.status});
  } catch(error){return NextResponse.json({ok:false,error:'paper_order_cancel_failed',detail:error instanceof Error?error.message:'unknown_error',capitalExecutionEnabled:false},{status:500});}
}
