import { getSql } from '@/lib/db';
import { countSurvivors, summarizeProvenance, type ProvenanceAudit } from '@/lib/performance/provenance';

export type EvidenceScope = 'live' | 'validation' | 'all';
type MarkoutRow = { id:string; security_id:string; symbol:string; action:string; alpha:number; asymmetry:number; observed_at:string|Date; entry_price:string|null; mark_15_price:string|null; mark_60_price:string|null; };
const pct=(entry:number,exit:number)=>!entry||!Number.isFinite(entry)||!Number.isFinite(exit)?null:((exit/entry)-1)*100;
function aggregate(values:number[]){if(!values.length)return{count:0,averageReturnPct:0,medianReturnPct:0,hitRatePct:0};const sorted=[...values].sort((a,b)=>a-b),m=Math.floor(sorted.length/2),median=sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;return{count:values.length,averageReturnPct:Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(2)),medianReturnPct:Number(median.toFixed(2)),hitRatePct:Number((100*values.filter(v=>v>0).length/values.length).toFixed(2))};}

export async function getShadowPerformance(scope:EvidenceScope='live'){
 const sql=getSql(); if(!sql)return{available:false as const,reason:'database_not_configured' as const,mode:'shadow' as const,scope,liveEvidenceOnly:scope==='live',syntheticRows:0,provenance:summarizeProvenance(scope,{candidateRows:0,syntheticCandidates:0,syntheticSurviving:0,liveSurviving:0}),capitalExecutionEnabled:false as const,horizons:{m15:aggregate([]),m60:aggregate([])},byAction:{},evaluated:0};
 // Pre-filter census: counted without the provenance predicate so the audit
 // can show that filtering actually removed something, rather than restating
 // the predicate back to itself.
 const [census]=await sql`SELECT count(*)::int AS candidate_rows,count(*) FILTER(WHERE s.id LIKE 'validation:%')::int AS synthetic_candidates FROM opportunities o JOIN securities s ON s.id=o.security_id WHERE o.observed_at>=now()-interval '30 days'`;
 const rows=await sql`SELECT o.id,o.security_id,s.symbol,o.action,o.alpha,o.asymmetry,o.observed_at,entry.price entry_price,mark15.price mark_15_price,mark60.price mark_60_price FROM opportunities o JOIN securities s ON s.id=o.security_id LEFT JOIN LATERAL(SELECT m.price FROM market_snapshots m WHERE m.security_id=o.security_id AND m.observed_at<=o.observed_at ORDER BY m.observed_at DESC LIMIT 1)entry ON true LEFT JOIN LATERAL(SELECT m.price FROM market_snapshots m WHERE m.security_id=o.security_id AND m.observed_at>=o.observed_at+interval '15 minutes' ORDER BY m.observed_at ASC LIMIT 1)mark15 ON true LEFT JOIN LATERAL(SELECT m.price FROM market_snapshots m WHERE m.security_id=o.security_id AND m.observed_at>=o.observed_at+interval '60 minutes' ORDER BY m.observed_at ASC LIMIT 1)mark60 ON true WHERE o.observed_at>=now()-interval '30 days' AND (${scope}='all' OR (${scope}='live' AND s.id NOT LIKE 'validation:%') OR (${scope}='validation' AND s.id LIKE 'validation:%')) ORDER BY o.observed_at DESC LIMIT 500` as unknown as MarkoutRow[];
 const m15:number[]=[],m60:number[]=[];const by=new Map<string,{m15:number[];m60:number[]}>();
 const survivors=countSurvivors(rows);
 const provenance:ProvenanceAudit=summarizeProvenance(scope,{candidateRows:Number(census?.candidate_rows??0),syntheticCandidates:Number(census?.synthetic_candidates??0),syntheticSurviving:survivors.syntheticSurviving,liveSurviving:survivors.liveSurviving});
 for(const r of rows){const entry=Number(r.entry_price),a=r.mark_15_price==null?null:pct(entry,Number(r.mark_15_price)),b=r.mark_60_price==null?null:pct(entry,Number(r.mark_60_price)),bucket=by.get(r.action)??{m15:[],m60:[]};if(a!=null){m15.push(a);bucket.m15.push(a)}if(b!=null){m60.push(b);bucket.m60.push(b)}by.set(r.action,bucket)}
 const byAction=Object.fromEntries([...by].map(([action,v])=>[action,{m15:aggregate(v.m15),m60:aggregate(v.m60)}]));
 return{available:true as const,mode:'shadow' as const,scope,liveEvidenceOnly:scope==='live',syntheticRows:provenance.syntheticSurviving,provenanceSafe:provenance.provenanceSafe,provenance,capitalExecutionEnabled:false as const,evaluated:rows.length,matured15m:m15.length,matured60m:m60.length,horizons:{m15:aggregate(m15),m60:aggregate(m60)},byAction,measuredAt:new Date().toISOString()};
}
