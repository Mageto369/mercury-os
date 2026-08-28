import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { DEFAULT_PAPER_ACCOUNT_ID } from '@/lib/paper/account';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function mean(values:number[]){return values.length?values.reduce((a,b)=>a+b,0)/values.length:0}
function std(values:number[]){if(values.length<2)return 0;const m=mean(values);return Math.sqrt(values.reduce((s,v)=>s+(v-m)**2,0)/(values.length-1))}

export async function GET(){
 const sql=getSql(); if(!sql)return NextResponse.json({ok:false,error:'database_not_configured',capitalExecutionEnabled:false},{status:503});
 try{
  const snapshots=await sql`select cash,market_value,equity,realized_pnl,unrealized_pnl,gross_exposure,position_count,observed_at from paper_account_snapshots where account_id=${DEFAULT_PAPER_ACCOUNT_ID} order by observed_at asc limit 5000`;
  const fills=await sql`select po.id,po.side,po.requested_qty,po.average_fill_price,po.fee_amount,po.slippage_bps,po.created_at,s.symbol from paper_orders po join securities s on s.id=po.security_id where po.status='filled' and s.id not like 'validation:%' order by po.created_at asc limit 5000`;
  const journals=await sql`select j.id,j.order_id,s.symbol,j.thesis,j.catalyst,j.risk_notes,j.context,j.outcome,j.created_at from paper_trade_journal j join securities s on s.id=j.security_id where s.id not like 'validation:%' order by j.created_at desc limit 100`;
  const equity=snapshots.map(r=>Number(r.equity));
  const returns:number[]=[];for(let i=1;i<equity.length;i++){if(equity[i-1]>0)returns.push((equity[i]-equity[i-1])/equity[i-1])}
  let peak=equity[0]??0,maxDrawdown=0;for(const value of equity){peak=Math.max(peak,value);if(peak>0)maxDrawdown=Math.min(maxDrawdown,(value-peak)/peak)}
  const positive=returns.filter(v=>v>0),negative=returns.filter(v=>v<0);
  const avg=mean(returns),sigma=std(returns),downside=std(negative);
  const profitFactor=Math.abs(negative.reduce((a,b)=>a+b,0))>0?positive.reduce((a,b)=>a+b,0)/Math.abs(negative.reduce((a,b)=>a+b,0)):positive.length?Infinity:0;
  return NextResponse.json({ok:true,mode:'paper',capitalExecutionEnabled:false,evidenceScope:'live-only',metrics:{snapshotCount:snapshots.length,fillCount:fills.length,returnObservations:returns.length,totalReturnPct:equity.length>1&&equity[0]>0?((equity[equity.length-1]/equity[0])-1)*100:0,maxDrawdownPct:maxDrawdown*100,winRatePct:returns.length?positive.length/returns.length*100:0,averageReturnPct:avg*100,sharpeLike:sigma?avg/sigma*Math.sqrt(252):0,sortinoLike:downside?avg/downside*Math.sqrt(252):0,profitFactor:Number.isFinite(profitFactor)?profitFactor:null},equityCurve:snapshots,fills,journal:journals});
 }catch(error){return NextResponse.json({ok:false,error:'paper_performance_failed',detail:error instanceof Error?error.message:'unknown_error',capitalExecutionEnabled:false},{status:500})}
}
