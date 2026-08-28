import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { getPaperAccountSnapshot } from '@/lib/paper/account';
import { buildRiskSizing, portfolioRiskSummary } from '@/lib/paper/risk-intelligence';
import { buildCorrelationMatrix } from '@/lib/paper/correlation';
import { adminAuthorized, sameOriginMutation } from '@/lib/admin/security';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const SizingSchema=z.object({symbol:z.string().trim().min(1).max(16).transform(v=>v.toUpperCase()),conviction:z.number().min(0).max(100).default(50)});
async function currentDrawdownPct(sql:NonNullable<ReturnType<typeof getSql>>){const rows=await sql`select equity from paper_account_snapshots where account_id='paper:primary' order by observed_at asc limit 5000`;let peak=0,dd=0;for(const r of rows){const e=Number(r.equity??0);peak=Math.max(peak,e);if(peak>0)dd=Math.min(dd,(e-peak)/peak*100)}return dd}

export async function GET(){
 const sql=getSql();if(!sql)return NextResponse.json({ok:false,error:'database_not_configured',capitalExecutionEnabled:false},{status:503});
 try{
  const account=await getPaperAccountSnapshot();if(!account)return NextResponse.json({ok:false,error:'paper_account_unavailable',capitalExecutionEnabled:false},{status:409});
  const dd=await currentDrawdownPct(sql);const portfolio=portfolioRiskSummary(account.equity,account.positions.map(p=>({symbol:String(p.symbol),marketValue:Number(p.marketValue),unrealizedPnl:Number(p.unrealizedPnl)})),dd);
  const ids=account.positions.map(p=>String(p.security_id));let correlations={matrix:[],highCorrelationPairs:[],minimumObservations:3,method:'pearson_aligned_period_returns'} as ReturnType<typeof buildCorrelationMatrix>;
  if(ids.length){const bars=await sql`select h.security_id,h.bar_time,h.close,s.symbol from historical_bars h join securities s on s.id=h.security_id where h.security_id=any(${sql.array(ids)}) and h.timeframe='1d' and s.id not like 'validation:%' order by h.bar_time desc limit ${Math.max(120,ids.length*120)}`;const by=new Map<string,Array<{time:string;close:number}>>();for(const row of bars){const symbol=String(row.symbol),points=by.get(symbol)??[];points.push({time:new Date(row.bar_time).toISOString().slice(0,10),close:Number(row.close)});by.set(symbol,points)}correlations=buildCorrelationMatrix([...by.entries()].map(([symbol,points])=>({symbol,points})))}
  const [kill]=await sql`select count(*) filter(where severity in('critical','high'))::int as elevated,count(*)::int as total from risk_incidents`;
  return NextResponse.json({ok:true,mode:'paper',currentDrawdownPct:dd,portfolio,correlations,killSwitches:{elevated:Number(kill?.elevated??0),total:Number(kill?.total??0),capitalExecutionEnabled:false},policies:{maxPositionPct:5,maxRiskPerTradePct:1,drawdownLevels:[-5,-10,-15]},capitalExecutionEnabled:false});
 }catch(error){return NextResponse.json({ok:false,error:'paper_risk_failed',detail:error instanceof Error?error.message:'unknown_error',capitalExecutionEnabled:false},{status:500})}
}

export async function POST(request:Request){if(!sameOriginMutation(request))return NextResponse.json({ok:false,error:'origin_mismatch'},{status:403});if(!adminAuthorized(request))return NextResponse.json({ok:false,error:'admin_session_required'},{status:401});const sql=getSql();if(!sql)return NextResponse.json({ok:false,error:'database_not_configured'},{status:503});const parsed=SizingSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({ok:false,error:'invalid_sizing_request',issues:parsed.error.flatten()},{status:400});try{const account=await getPaperAccountSnapshot();if(!account)return NextResponse.json({ok:false,error:'paper_account_unavailable'},{status:409});const [security]=await sql`select id,symbol from securities where upper(symbol)=${parsed.data.symbol} and active=true and id not like 'validation:%' limit 1`;if(!security)return NextResponse.json({ok:false,error:'security_not_found'},{status:404});const [snapshot]=await sql`select price,dollar_volume,spread_bps,rvol,float_rotation from market_snapshots where security_id=${security.id} order by observed_at desc limit 1`;if(!snapshot)return NextResponse.json({ok:false,error:'market_snapshot_required'},{status:409});const dd=await currentDrawdownPct(sql);const sizing=buildRiskSizing({equity:account.equity,cash:account.cash,price:Number(snapshot.price),dollarVolume:Number(snapshot.dollar_volume??0),spreadBps:Number(snapshot.spread_bps??0),rvol:Number(snapshot.rvol??1),floatRotation:Number(snapshot.float_rotation??0),conviction:parsed.data.conviction,currentDrawdownPct:dd});return NextResponse.json({ok:true,symbol:security.symbol,currentDrawdownPct:dd,sizing,capitalExecutionEnabled:false,brokerConnected:false});}catch(error){return NextResponse.json({ok:false,error:'paper_sizing_failed',detail:error instanceof Error?error.message:'unknown_error',capitalExecutionEnabled:false},{status:500})}}
