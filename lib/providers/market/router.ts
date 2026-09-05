import { randomUUID } from 'node:crypto';
import { getSql } from '@/lib/db';
import { intrinioMarketProvider } from '@/lib/providers/market/intrinio';
import { massiveMarketProvider } from '@/lib/providers/market/massive';
import type { MarketProvider, MarketProviderName, MarketProviderPullResult } from '@/lib/providers/market/types';
import { toJsonb } from '@/lib/db/json';

const providers: Record<MarketProviderName, MarketProvider> = { massive: massiveMarketProvider, intrinio: intrinioMarketProvider };
function selectedProviders(): MarketProvider[] { const configuredMode=(process.env.MARKET_DATA_PROVIDER??'auto').toLowerCase();if(configuredMode==='massive')return[providers.massive];if(configuredMode==='intrinio')return[providers.intrinio];return[providers.massive,providers.intrinio]; }
export async function getMarketProviderStatus(){return{mode:process.env.MARKET_DATA_PROVIDER??'auto',providers:await Promise.all(Object.values(providers).map(async provider=>({name:provider.name,configured:await provider.configured()}))),preferred:selectedProviders().map(provider=>provider.name)}}
export async function pullAndPersistMarketData(maxSymbolsOverride?:number){
 const sql=getSql();if(!sql)return{ok:false as const,reason:'database_not_configured' as const,attempts:[] as MarketProviderPullResult[]};
 const maxSymbols=Math.max(1,Math.min(5000,Number(maxSymbolsOverride??process.env.MARKET_PULL_MAX_SYMBOLS??750)));
 const recordHealth=async(provider:MarketProvider,configured:boolean,result?:MarketProviderPullResult)=>{
   const ok=Boolean(result?.ok);
   const status=!configured?'not_configured':ok?'healthy':'degraded';
   const now=new Date().toISOString();
   const latencyMs=result?Math.max(0,Date.parse(result.completedAt)-Date.parse(result.startedAt)):null;
   const error=result?.errors.map(item=>item.symbol?`${item.symbol}:${item.message}`:item.message).join('; ')||null;
   await sql`INSERT INTO provider_health(provider,provider_group,configured,authoritative,last_status,consecutive_failures,last_success_at,last_failure_at,latency_ms,records_received,last_error,metadata,updated_at)
     VALUES(${provider.name},'market-data',${configured},false,${status},${!configured||ok?0:1},${ok?now:null},${configured&&!ok?now:null},${latencyMs},${result?.received??0},${error},${toJsonb({shadowOnly:true})}::jsonb,now())
     ON CONFLICT(provider) DO UPDATE SET configured=EXCLUDED.configured,last_status=EXCLUDED.last_status,
       consecutive_failures=CASE WHEN EXCLUDED.last_status='healthy' THEN 0 WHEN EXCLUDED.last_status='not_configured' THEN provider_health.consecutive_failures ELSE provider_health.consecutive_failures+1 END,
       last_success_at=COALESCE(EXCLUDED.last_success_at,provider_health.last_success_at),last_failure_at=COALESCE(EXCLUDED.last_failure_at,provider_health.last_failure_at),
       latency_ms=EXCLUDED.latency_ms,records_received=EXCLUDED.records_received,last_error=EXCLUDED.last_error,metadata=EXCLUDED.metadata,updated_at=now()`;
 };
 // Refresh unseen and stalest symbols first. Alphabetical-only selection leaves
 // every symbol after the first batch permanently untouched.
 const universe=await sql`
   SELECT s.id, s.symbol
   FROM securities s
   LEFT JOIN LATERAL (
     SELECT max(ms.observed_at) AS last_snapshot_at
     FROM market_snapshots ms
     WHERE ms.security_id = s.id
   ) latest ON true
   WHERE s.active = true AND s.id NOT LIKE 'validation:%'
   ORDER BY latest.last_snapshot_at ASC NULLS FIRST, s.symbol
   LIMIT ${maxSymbols}`;
 const symbols=universe.map(row=>String(row.symbol));if(!symbols.length)return{ok:false as const,reason:'universe_empty' as const,attempts:[] as MarketProviderPullResult[]};
 const securityIds=new Map(universe.map(row=>[String(row.symbol),String(row.id)]));const attempts:MarketProviderPullResult[]=[];let winner:MarketProviderPullResult|null=null;
 for(const provider of selectedProviders()){
   const configured=await provider.configured();
   if(!configured){await recordHealth(provider,false);continue;}
   const result=await provider.pull(symbols);attempts.push(result);await recordHealth(provider,true,result);
   if(result.ok&&result.snapshots.length){winner=result;break}
 }
 if(!winner)return{ok:false as const,reason:attempts.length?'all_market_providers_failed' as const:'market_provider_not_configured' as const,attempts};
 const structures=await sql`SELECT DISTINCT ON (security_id) security_id, float_shares FROM share_structures WHERE security_id = ANY(${sql.array([...securityIds.values()])}) ORDER BY security_id, observed_at DESC`;const floats=new Map(structures.map(row=>[String(row.security_id),Number(row.float_shares??0)]));let inserted=0;
 for(const snapshot of winner.snapshots){const securityId=securityIds.get(snapshot.symbol);if(!securityId)continue;const floatShares=floats.get(securityId)??0;const floatRotation=floatShares>0?snapshot.volume/floatShares:null;const payload=JSON.parse(JSON.stringify({source:snapshot.source,provider:snapshot.providerPayload??{},livePull:true})) as Record<string,string|number|boolean|null|Record<string,string|number|boolean|null>>;await sql`INSERT INTO market_snapshots (id,security_id,price,volume,dollar_volume,bid,ask,spread_bps,rvol,float_rotation,payload,observed_at) VALUES (${randomUUID()},${securityId},${snapshot.price},${Math.round(snapshot.volume)},${snapshot.dollarVolume},${snapshot.bid??null},${snapshot.ask??null},${snapshot.spreadBps??null},${snapshot.rvol??null},${floatRotation},${toJsonb(payload)}::jsonb,${snapshot.observedAt})`;inserted++}
 return{ok:true as const,provider:winner.provider,inserted,requested:symbols.length,received:winner.received,errors:winner.errors,attempts,mode:'shadow' as const,capitalExecutionEnabled:false as const,completedAt:new Date().toISOString()};
}
