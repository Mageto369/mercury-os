import { createHash } from 'node:crypto';
import { getSql } from '@/lib/db';
import { bootstrapOpenSourceIntelligence } from '@/lib/db/bootstrap-open-source';
import { callSidecar } from '@/lib/integrations/sidecar-client';
import { toJsonb } from '@/lib/db/json';

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function baseUrl(specific?: string) {
  return specific || process.env.OPEN_INTELLIGENCE_URL;
}

export function normalizeSidecarTimestamp(value: string) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime()))
    throw new Error(`invalid_sidecar_timestamp:${value}`);
  return timestamp.toISOString();
}

export function summarizeProviderBatch(
  label: string,
  attempted: number,
  failed: number,
) {
  const ok = attempted === 0 || failed < attempted;
  return ok
    ? { ok: true as const }
    : { ok: false as const, reason: `all_${label}_requests_failed` };
}

export function identityProviderUrls(
  env: Record<string, string | undefined> = process.env,
) {
  return {
    mapperUrl: env.SEC_CIK_MAPPER_URL?.trim() || null,
    financeUrl: env.FINANCE_DATABASE_URL?.trim() || null,
  };
}

export function isProviderOutage(reason: string) {
  return /^(http_5\d\d|fetch failed|sidecar_|The operation was aborted)/i.test(reason);
}

async function safeSync<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof Error ? error.message : 'open_intelligence_sync_failed',
    };
  }
}

type Identity = { symbol:string; cik?:string|null; issuerName?:string|null; exchange?:string|null; source:string; evidenceClass:string };
type EquityRef = { symbol:string; found:boolean; records?:Array<Record<string, unknown>>; source:string; evidenceClass:string };
type Calendar = { exchange:string; sessions:Array<{sessionDate:string;openAt:string;closeAt:string;earlyClose:boolean}>; source:string };
type Fred = { seriesId:string; observations:Array<{observationDate:string;vintageDate:string;value:number|null}>; source:string };
type Form4 = { identifier:string; transactions:Array<{accessionNumber?:string|null;filingDate?:string|null;payload:Record<string, unknown>}>; source:string };
type Universe = { total:number; offset:number; limit:number; securities:Array<{symbol:string;name?:string|null;market:string;cik:string}>; source:string; evidenceClass:string };

export async function getOpenIntelligenceStatus() {
  const url = process.env.OPEN_INTELLIGENCE_URL;
  const result = await callSidecar<Record<string, unknown>>(url, '/health');
  return {
    configured: Boolean(url),
    reachable: result.ok,
    latencyMs: result.latencyMs,
    health: result.ok ? result.data : null,
    reason: result.ok ? null : result.reason,
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
  };
}

async function syncUniverse() {
  const sql=getSql(); if(!sql) return {ok:false as const,reason:'database_not_configured' as const};
  const exchanges=(process.env.SEC_UNIVERSE_EXCHANGES ?? 'Nasdaq,NYSE,OTC').split(',').map(x=>x.trim()).filter(Boolean);
  const pageSize=Math.max(100,Math.min(5000,Number(process.env.SEC_UNIVERSE_PAGE_SIZE ?? 1000)));
  const maxRows=Math.max(pageSize,Math.min(25000,Number(process.env.SEC_UNIVERSE_MAX_SECURITIES ?? 20000)));
  let offset=0; let upserted=0; let total=0;
  while(offset<maxRows){
    const path=`/reference/universe?exchanges=${encodeURIComponent(exchanges.join(','))}&offset=${offset}&limit=${Math.min(pageSize,maxRows-offset)}`;
    const result=await callSidecar<Universe>(baseUrl(process.env.SEC_CIK_MAPPER_URL),path);
    if(!result.ok)return{ok:false as const,reason:result.reason,upserted,total};
    total=result.data.total;
    const records=result.data.securities;
    if(!records.length)break;
    const q=await sql`WITH source AS (
      SELECT upper(symbol) AS symbol,name,upper(market) AS market,lpad(cik,10,'0') AS cik
      FROM jsonb_to_recordset(${toJsonb(records)}::jsonb) AS x(symbol text,name text,market text,cik text)
    )
    INSERT INTO securities(id,symbol,name,market,cik,active)
    SELECT 'sec:'||cik||':'||symbol,symbol,name,market,cik,true FROM source
    ON CONFLICT(symbol) DO UPDATE SET name=EXCLUDED.name,market=EXCLUDED.market,cik=EXCLUDED.cik,active=true,updated_at=now()
    RETURNING id`;
    upserted+=q.length;
    offset+=records.length;
    if(offset>=total)break;
  }
  return{ok:true as const,source:'sec-company-tickers' as const,exchanges,total,upserted,completedAt:new Date().toISOString()};
}

async function syncIdentities(limit: number) {
  const sql = getSql(); if (!sql) return { ok:false as const, reason:'database_not_configured' as const };
  const catalogRows = await sql`INSERT INTO security_identities
      (id,security_id,cik,ticker,issuer_name,exchange,source,evidence_class,payload)
    SELECT 'catalog:'||s.id,s.id,lpad(regexp_replace(s.cik,'\\D','','g'),10,'0'),upper(s.symbol),s.name,upper(s.market),
      'securities-catalog','reference',jsonb_build_object('catalogSource',true,'securityId',s.id)
    FROM securities s
    WHERE s.active=true AND s.cik IS NOT NULL AND btrim(s.cik)<>''
    ON CONFLICT(id) DO UPDATE SET cik=EXCLUDED.cik,ticker=EXCLUDED.ticker,issuer_name=EXCLUDED.issuer_name,
      exchange=EXCLUDED.exchange,payload=EXCLUDED.payload,observed_at=now()
    WHERE (security_identities.cik,security_identities.ticker,security_identities.issuer_name,security_identities.exchange,security_identities.payload)
      IS DISTINCT FROM (EXCLUDED.cik,EXCLUDED.ticker,EXCLUDED.issuer_name,EXCLUDED.exchange,EXCLUDED.payload)
    RETURNING id`;
  const {mapperUrl,financeUrl}=identityProviderUrls();
  const securities = mapperUrl || financeUrl
    ? await sql`SELECT s.id,s.symbol FROM securities s
        WHERE s.active=true ORDER BY s.symbol LIMIT ${limit}`
    : [];
  let inserted = 0; let enriched = 0; let attempted=0; let failed=0; const errors:string[]=[];
  for (const security of securities) {
    const symbol = String(security.symbol).toUpperCase();
    if(mapperUrl){
      attempted+=1;
      const identity = await callSidecar<Identity>(mapperUrl, `/identity/${encodeURIComponent(symbol)}`);
      if (identity.ok) {
        const x=identity.data;
        const q=await sql`INSERT INTO security_identities (id,security_id,cik,ticker,issuer_name,exchange,source,evidence_class,payload)
          VALUES (${hash(['cik-map',symbol,x.cik,x.exchange])},${String(security.id)},${x.cik ?? null},${symbol},${x.issuerName ?? null},${x.exchange ?? null},${x.source},${x.evidenceClass},${toJsonb(x)}::jsonb)
          ON CONFLICT(id) DO UPDATE SET cik=EXCLUDED.cik,issuer_name=EXCLUDED.issuer_name,exchange=EXCLUDED.exchange,payload=EXCLUDED.payload,observed_at=now() RETURNING id`;
        inserted += q.length;
      } else {failed+=1;errors.push(`${symbol}:identity:${identity.reason}`);}
    }

    if(financeUrl){
      attempted+=1;
      const ref = await callSidecar<EquityRef>(financeUrl, `/reference/equity/${encodeURIComponent(symbol)}`);
      if(!ref.ok){failed+=1;errors.push(`${symbol}:reference:${ref.reason}`);}
      else if (ref.data.found) {
        for (const row of ref.data.records ?? []) {
          const ticker=String(row.symbol ?? symbol).toUpperCase();
          const q=await sql`INSERT INTO security_identities (id,security_id,ticker,issuer_name,exchange,cusip,isin,figi,source,evidence_class,payload)
            VALUES (${hash(['finance-db',security.id,ticker,row.cusip,row.isin,row.figi])},${String(security.id)},${ticker},${row.name ? String(row.name) : null},${row.exchange ? String(row.exchange) : null},${row.cusip ? String(row.cusip) : null},${row.isin ? String(row.isin) : null},${row.figi ? String(row.figi) : null},'financedatabase','reference',${toJsonb(row)}::jsonb)
            ON CONFLICT DO NOTHING RETURNING id`;
          enriched += q.length;
        }
      }
    }
  }
  const batch=summarizeProviderBatch('identity_enrichment', attempted, failed);
  return {...batch,status:errors.length?'degraded' as const:'success' as const,catalogRowsUpserted:catalogRows.length,securities:securities.length,identityRowsInserted:inserted,referenceRowsInserted:enriched,errors};
}

async function syncCalendars() {
  const sql=getSql(); if(!sql) return {ok:false as const,reason:'database_not_configured' as const};
  const exchanges=(process.env.MARKET_CALENDAR_EXCHANGES ?? 'NYSE,NASDAQ').split(',').map(x=>x.trim()).filter(Boolean);
  const days=Math.max(30,Math.min(730,Number(process.env.MARKET_CALENDAR_FORWARD_DAYS ?? 180)));
  const start=new Date(); const end=new Date(Date.now()+days*86_400_000);
  let inserted=0; const errors:string[]=[];
  for(const exchange of exchanges){
    const path=`/calendar/${encodeURIComponent(exchange)}?start=${start.toISOString().slice(0,10)}&end=${end.toISOString().slice(0,10)}`;
    const result=await callSidecar<Calendar>(baseUrl(process.env.MARKET_CALENDAR_URL),path);
    if(!result.ok){errors.push(`${exchange}:${result.reason}`);continue;}
    for(const session of result.data.sessions){
      const q=await sql`INSERT INTO market_sessions (id,exchange,session_date,open_at,close_at,early_close,source,payload)
        VALUES (${hash(['calendar',exchange,session.sessionDate])},${exchange},${session.sessionDate},${normalizeSidecarTimestamp(session.openAt)},${normalizeSidecarTimestamp(session.closeAt)},${session.earlyClose},${result.data.source},${toJsonb(session)}::jsonb)
        ON CONFLICT (exchange,session_date) DO UPDATE SET open_at=EXCLUDED.open_at,close_at=EXCLUDED.close_at,early_close=EXCLUDED.early_close,source=EXCLUDED.source,payload=EXCLUDED.payload RETURNING id`;
      inserted+=q.length;
    }
  }
  return {...summarizeProviderBatch('calendar', exchanges.length, errors.length),exchanges,inserted,errors};
}

async function syncMacro() {
  const sql=getSql(); if(!sql) return {ok:false as const,reason:'database_not_configured' as const};
  const series=(process.env.FRED_SERIES_IDS ?? 'DFF,DGS2,DGS10,VIXCLS,DTWEXBGS').split(',').map(x=>x.trim()).filter(Boolean);
  const lookback=Math.max(30,Math.min(3650,Number(process.env.FRED_LOOKBACK_DAYS ?? 730)));
  const end=new Date(); const start=new Date(Date.now()-lookback*86_400_000);
  const errors:string[]=[];
  const batches=await Promise.all(series.map(async(id)=>{
    const path=`/fred/${encodeURIComponent(id)}?start=${start.toISOString().slice(0,10)}&end=${end.toISOString().slice(0,10)}`;
    const result=await callSidecar<Fred>(baseUrl(process.env.FRED_SIDECAR_URL),path);
    if(!result.ok){errors.push(`${id}:${result.reason}`);return [];}
    return result.data.observations.map((obs)=>({
      id:hash(['fred',id,obs.observationDate,obs.vintageDate]),series_id:id,
      observation_date:obs.observationDate,vintage_date:obs.vintageDate,value:obs.value,
      source:result.data.source,payload:obs,
    }));
  }));
  const observations=batches.flat();
  let inserted=0;
  if(observations.length){
    const q=await sql`INSERT INTO macro_observations
        (id,series_id,observation_date,vintage_date,value,source,authoritative,payload)
      SELECT id,series_id,observation_date,vintage_date,value,source,true,payload
      FROM jsonb_to_recordset(${toJsonb(observations)}::jsonb) AS x(
        id text,series_id text,observation_date date,vintage_date date,value numeric,source text,payload jsonb)
      ON CONFLICT (series_id,observation_date,vintage_date) DO UPDATE
        SET value=EXCLUDED.value,source=EXCLUDED.source,payload=EXCLUDED.payload
      RETURNING id`;
    inserted=q.length;
  }
  return {...summarizeProviderBatch('macro', series.length, errors.length),series,inserted,errors};
}

async function syncForm4(limit: number) {
  const sql=getSql(); if(!sql) return {ok:false as const,reason:'database_not_configured' as const};
  const rows=await sql`SELECT id,symbol,cik FROM securities WHERE active=true AND cik IS NOT NULL ORDER BY symbol LIMIT ${limit}`;
  const circuitThreshold=Math.max(1,Math.min(5,Number(process.env.SIDECAR_CIRCUIT_FAILURES ?? 2)));
  let inserted=0; let attempted=0; let consecutiveOutages=0; const errors:string[]=[];
  for(const security of rows){
    const symbol=String(security.symbol);
    attempted+=1;
    const result=await callSidecar<Form4>(baseUrl(process.env.EDGARTOOLS_URL),`/edgar/form4/${encodeURIComponent(symbol)}?limit=10`);
    if(!result.ok){
      errors.push(`${symbol}:${result.reason}`);
      consecutiveOutages=isProviderOutage(result.reason)?consecutiveOutages+1:0;
      if(consecutiveOutages>=circuitThreshold)break;
      continue;
    }
    consecutiveOutages=0;
    for(const tx of result.data.transactions){
      const accession=tx.accessionNumber ?? null;
      const q=await sql`INSERT INTO insider_transactions (id,security_id,cik,accession_number,transaction_date,source,payload)
        VALUES (${hash(['form4',security.id,accession,tx.filingDate,tx.payload])},${String(security.id)},${String(security.cik)},${accession},${tx.filingDate || null},${result.data.source},${toJsonb(tx.payload)}::jsonb)
        ON CONFLICT DO NOTHING RETURNING id`;
      inserted+=q.length;
    }
  }
  const batch=summarizeProviderBatch('form4', attempted, errors.length);
  const skipped=Math.max(0,rows.length-attempted);
  return {...batch,status:errors.length?'degraded' as const:'success' as const,securities:rows.length,attempted,skipped,circuitOpen:skipped>0,inserted,errors};
}

export async function runOpenIntelligenceSync() {
  const sql=getSql(); if(!sql) return {ok:false as const,reason:'database_not_configured' as const};
  const bootstrap=await bootstrapOpenSourceIntelligence();
  if(!bootstrap.ok) return bootstrap;
  if(!process.env.OPEN_INTELLIGENCE_URL && !process.env.EDGARTOOLS_URL && !process.env.SEC_CIK_MAPPER_URL && !process.env.FINANCE_DATABASE_URL && !process.env.MARKET_CALENDAR_URL && !process.env.FRED_SIDECAR_URL)
    return {ok:false as const,reason:'open_intelligence_sidecar_not_configured' as const};
  const universe=await safeSync(syncUniverse);
  const maxSecurities=Math.max(1,Math.min(500,Number(process.env.OPEN_INTELLIGENCE_MAX_SECURITIES ?? 100)));
  const form4Max=Math.max(0,Math.min(100,Number(process.env.EDGAR_FORM4_MAX_COMPANIES ?? 10)));
  const [identities,calendars,macro,form4]=await Promise.all([
    safeSync(() => syncIdentities(maxSecurities)),
    safeSync(syncCalendars),
    safeSync(syncMacro),
    safeSync(() => form4Max ? syncForm4(form4Max) : Promise.resolve({ok:true as const,status:'success' as const,securities:0,attempted:0,skipped:0,circuitOpen:false,inserted:0,errors:[]})),
  ]);
  return {ok:Boolean(universe.ok||identities.ok||calendars.ok||macro.ok||form4.ok),mode:'shadow' as const,capitalExecutionEnabled:false as const,universe,identities,calendars,macro,form4,completedAt:new Date().toISOString()};
}
