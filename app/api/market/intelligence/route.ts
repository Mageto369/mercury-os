import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
 const sql=getSql();if(!sql)return NextResponse.json({ok:false,error:'database_not_configured'},{status:503});
 const symbol=new URL(request.url).searchParams.get('symbol')?.trim().toUpperCase()??null;
 try{
  const scannerPromise=sql`
   select distinct on(o.security_id) o.id,o.security_id,s.symbol,s.name,s.market,o.state,o.alpha,o.gem,o.wave,o.asymmetry,o.catalyst,o.social,o.liquidity,o.trap_risk,o.peak_risk,o.confidence,o.aggression,o.action,o.hard_blocked,o.observed_at,ms.price,ms.volume,ms.dollar_volume,ms.rvol,ms.spread_bps
   from opportunities o join securities s on s.id=o.security_id left join lateral(select price,volume,dollar_volume,rvol,spread_bps from market_snapshots m where m.security_id=s.id order by observed_at desc limit 1)ms on true
   where s.id not like 'validation:%' and s.active=true order by o.security_id,o.observed_at desc
  `;
  const regimePromise=sql`select regime,confidence,features,observed_at from regime_states where evidence_scope='live' order by observed_at desc limit 1`;
  const catalystsPromise=sql`select ca.id,s.symbol,ca.type,ca.effective_date,ca.risk_score,ca.payload,ca.observed_at from corporate_actions ca join securities s on s.id=ca.security_id where s.id not like 'validation:%' order by coalesce(ca.effective_date,ca.observed_at) desc limit 100`;
  const referenceQuotesPromise=sql`
   with latest as (
    select distinct on(ms.security_id) ms.security_id,ms.price,ms.volume,ms.dollar_volume,ms.observed_at,ms.payload
    from market_snapshots ms
    join securities s on s.id=ms.security_id
    where s.active=true and s.id not like 'validation:%' and ms.payload->>'evidenceClass'='delayed-reference'
    order by ms.security_id,ms.observed_at desc
   )
   select s.symbol,s.name,s.market,l.price,l.volume,l.dollar_volume,l.observed_at,l.payload->>'source' source
   from latest l join securities s on s.id=l.security_id
   order by l.dollar_volume desc nulls last,s.symbol
   limit 200`;
  const [scanner,regimeRows,catalysts,referenceQuotes]=await Promise.all([scannerPromise,regimePromise,catalystsPromise,referenceQuotesPromise]);
  const ranked=[...scanner].sort((a,b)=>Number(b.asymmetry??0)-Number(a.asymmetry??0)).slice(0,200);
  const watchlists={
   gems:ranked.filter(r=>Number(r.gem)>=70).slice(0,30),
   momentum:ranked.filter(r=>Number(r.wave)>=70).slice(0,30),
   catalysts:ranked.filter(r=>Number(r.catalyst)>=65).slice(0,30),
   unusualVolume:ranked.filter(r=>Number(r.rvol??0)>=2).slice(0,30),
   highRisk:ranked.filter(r=>Number(r.trap_risk)>=65||Number(r.peak_risk)>=70).slice(0,30),
  };
  const regime=regimeRows[0];
  if(!symbol)return NextResponse.json({ok:true,mode:'live-with-delayed-reference',scanner:ranked,referenceQuotes,watchlists,catalystCalendar:catalysts,regime:regime??null,capitalExecutionEnabled:false});
  const [security]=await sql`select id,symbol,name,market,cik from securities where upper(symbol)=${symbol} and active=true and id not like 'validation:%' limit 1`;
  if(!security)return NextResponse.json({ok:false,error:'security_not_found'},{status:404});
  const [bars,filings,insiders,financing,structures,structureRows,ownershipRows,tickerCatalysts,social,referenceRows]=await Promise.all([
   sql`select timeframe,bar_time,open,high,low,close,volume,vwap,source from historical_bars where security_id=${security.id} order by bar_time desc limit 300`,
   sql`select accession_number,form,filed_at,url,parsed from filings where security_id=${security.id} order by filed_at desc limit 40`,
   sql`select owner_name,owner_role,transaction_code,transaction_date,shares,price,ownership_after,derivative,source from insider_transactions where security_id=${security.id} order by coalesce(transaction_date,current_date) desc limit 50`,
   sql`select form,event_type,announced_at,amount_usd,shares,exercise_price,confidence,source,payload from financing_events where security_id=${security.id} order by coalesce(announced_at,observed_at) desc limit 50`,
   sql`select authorized_shares,outstanding_shares,float_shares,verified,source,observed_at from share_structures where security_id=${security.id} order by observed_at desc limit 50`,
   sql`select effective_float,outstanding_shares,authorized_shares,reserved_dilution_shares,dilution_overhang_pct,dilution_risk,float_confidence,risk_factors,evidence,observed_at from structure_intelligence where security_id=${security.id} order by observed_at desc limit 1`,
   sql`select insider_net_shares,insider_buy_value,insider_sell_value,institutional_shares,ownership_alignment_score,confidence,evidence,observed_at from ownership_intelligence where security_id=${security.id} order by observed_at desc limit 1`,
   sql`select catalyst_type,materiality,novelty,credibility,half_life_minutes,source,evidence,observed_at from catalyst_intelligence where security_id=${security.id} order by observed_at desc limit 50`,
   sql`select source,sentiment,promotion_risk,engagement,observed_at from social_mentions where security_id=${security.id} order by observed_at desc limit 50`,
   sql`select price,volume,dollar_volume,observed_at,payload->>'source' source,payload->>'evidenceClass' evidence_class from market_snapshots where security_id=${security.id} order by observed_at desc limit 1`,
  ]);
  const structureIntel=structureRows[0],ownershipIntel=ownershipRows[0],latestReference=referenceRows[0];
  return NextResponse.json({ok:true,mode:'live-with-delayed-reference',security,latestReference:latestReference??null,bars:bars.reverse(),filings,insiders,financing,shareStructure:structures,structureIntelligence:structureIntel??null,ownershipIntelligence:ownershipIntel??null,catalysts:tickerCatalysts,social,regime:regime??null,capitalExecutionEnabled:false});
 }catch(error){return NextResponse.json({ok:false,error:'market_intelligence_failed',detail:error instanceof Error?error.message:'unknown_error',capitalExecutionEnabled:false},{status:500})}
}
