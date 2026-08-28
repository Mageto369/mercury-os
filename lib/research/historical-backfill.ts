import { randomUUID } from 'node:crypto';
import { getSql } from '@/lib/db';
import { bootstrapHistoricalReplay } from '@/lib/db/bootstrap-history';

type Provider = 'massive' | 'intrinio' | 'openbb';

type DailyBar = {
  symbol: string;
  time: Date;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  vwap?: number;
  transactions?: number;
  source: string;
};

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function dateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86_400_000)) days.push(isoDate(cursor));
  return days;
}

async function pullMassive(days: string[], tracked: Set<string>) {
  const key = process.env.MASSIVE_API_KEY ?? process.env.MARKET_DATA_API_KEY;
  if (!key) return { bars: [] as DailyBar[], errors: ['massive_api_key_not_configured'] };
  const bars: DailyBar[] = []; const errors: string[] = [];
  for (const day of days) {
    try {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000);
      const url = new URL(`https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/${day}`);
      url.searchParams.set('adjusted', 'true'); url.searchParams.set('include_otc', 'true'); url.searchParams.set('apiKey', key);
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal }); clearTimeout(timeout);
      if (!response.ok) throw new Error(`http_${response.status}`);
      const data = await response.json() as { results?: Array<Record<string, unknown>> };
      for (const row of data.results ?? []) {
        const symbol = String(row.T ?? '').toUpperCase(); const close = Number(row.c ?? 0);
        if (!tracked.has(symbol) || !Number.isFinite(close) || close <= 0) continue;
        bars.push({ symbol, time: new Date(Number(row.t ?? Date.parse(`${day}T00:00:00Z`))), open:Number(row.o ?? 0)||undefined, high:Number(row.h ?? 0)||undefined, low:Number(row.l ?? 0)||undefined, close, volume:Number(row.v ?? 0)||undefined, vwap:Number(row.vw ?? 0)||undefined, transactions:Number(row.n ?? 0)||undefined, source:'massive' });
      }
    } catch (error) { errors.push(`${day}:${error instanceof Error ? error.message : 'massive_backfill_failed'}`); }
  }
  return { bars, errors };
}

async function pullIntrinio(symbols: string[], startDate: string, endDate: string) {
  const key = process.env.INTRINIO_API_KEY;
  if (!key) return { bars: [] as DailyBar[], errors: ['intrinio_api_key_not_configured'] };
  const bars: DailyBar[] = []; const errors: string[] = [];
  const concurrency = Math.max(1, Math.min(10, Number(process.env.HISTORICAL_BACKFILL_CONCURRENCY ?? 4)));
  for (let i=0;i<symbols.length;i+=concurrency) {
    const batch=symbols.slice(i,i+concurrency);
    await Promise.all(batch.map(async symbol => {
      try {
        const url=new URL(`https://api-v2.intrinio.com/securities/${encodeURIComponent(symbol)}/prices`);
        url.searchParams.set('start_date',startDate); url.searchParams.set('end_date',endDate); url.searchParams.set('frequency','daily'); url.searchParams.set('page_size','10000');
        const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),12_000);
        const response=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{Authorization:`Bearer ${key}`}}); clearTimeout(timeout);
        if(!response.ok) throw new Error(`http_${response.status}`);
        const data=await response.json() as {stock_prices?:Array<Record<string,unknown>>};
        for(const row of data.stock_prices ?? []) { const close=Number(row.close ?? row.adj_close ?? 0); const date=String(row.date ?? ''); if(!date||!Number.isFinite(close)||close<=0) continue; bars.push({symbol,time:new Date(`${date}T00:00:00.000Z`),open:Number(row.open ?? row.adj_open ?? 0)||undefined,high:Number(row.high ?? row.adj_high ?? 0)||undefined,low:Number(row.low ?? row.adj_low ?? 0)||undefined,close,volume:Number(row.volume ?? row.adj_volume ?? 0)||undefined,source:'intrinio'}); }
      } catch(error) { errors.push(`${symbol}:${error instanceof Error ? error.message : 'intrinio_backfill_failed'}`); }
    }));
  }
  return { bars, errors };
}

async function pullOpenBb(symbols: string[], startDate: string, endDate: string) {
  const base = process.env.OPENBB_API_URL;
  if (!base) return { bars: [] as DailyBar[], errors: ['openbb_api_url_not_configured'] };
  const upstream = process.env.OPENBB_HISTORICAL_PROVIDER ?? 'yfinance';
  const auth = process.env.OPENBB_BASIC_AUTH;
  const bars: DailyBar[] = []; const errors: string[] = [];
  const concurrency = Math.max(1, Math.min(10, Number(process.env.HISTORICAL_BACKFILL_CONCURRENCY ?? 4)));
  for (let i=0;i<symbols.length;i+=concurrency) {
    const batch=symbols.slice(i,i+concurrency);
    await Promise.all(batch.map(async symbol => {
      try {
        const url=new URL('/api/v1/equity/price/historical', base.endsWith('/') ? base : `${base}/`);
        url.searchParams.set('symbol',symbol); url.searchParams.set('start_date',startDate); url.searchParams.set('end_date',endDate); url.searchParams.set('interval','1d'); url.searchParams.set('provider',upstream);
        const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),15_000);
        const headers:Record<string,string>={Accept:'application/json'}; if(auth) headers.Authorization=`Basic ${auth}`;
        const response=await fetch(url,{cache:'no-store',signal:controller.signal,headers}); clearTimeout(timeout);
        if(!response.ok) throw new Error(`http_${response.status}`);
        const data=await response.json() as {results?:Array<Record<string,unknown>>; provider?:string};
        const actualProvider=String(data.provider ?? upstream);
        for(const row of data.results ?? []) { const close=Number(row.close ?? 0); const date=String(row.date ?? ''); if(!date||!Number.isFinite(close)||close<=0) continue; bars.push({symbol,time:new Date(date.length===10?`${date}T00:00:00.000Z`:date),open:Number(row.open ?? 0)||undefined,high:Number(row.high ?? 0)||undefined,low:Number(row.low ?? 0)||undefined,close,volume:Number(row.volume ?? 0)||undefined,vwap:Number(row.vwap ?? 0)||undefined,source:`openbb:${actualProvider}`}); }
      } catch(error) { errors.push(`${symbol}:${error instanceof Error ? error.message : 'openbb_backfill_failed'}`); }
    }));
  }
  return {bars,errors};
}

export async function backfillHistoricalMarket(input?: { startDate?: string; endDate?: string; provider?: Provider | 'auto' }) {
  const sql=getSql(); if(!sql) return {ok:false as const,reason:'database_not_configured' as const};
  await bootstrapHistoricalReplay();
  const endDate=input?.endDate ?? isoDate(new Date());
  const defaultDays=Math.max(20,Math.min(3650,Number(process.env.HISTORICAL_BACKFILL_DAYS ?? 365)));
  const startDate=input?.startDate ?? isoDate(new Date(Date.parse(`${endDate}T00:00:00Z`)-defaultDays*86_400_000));
  if(Date.parse(startDate)>Date.parse(endDate)) return {ok:false as const,reason:'invalid_date_range' as const};
  const maxDays=Math.max(1,Math.min(3650,Number(process.env.HISTORICAL_BACKFILL_MAX_DAYS ?? 730))); const days=dateRange(startDate,endDate);
  if(days.length>maxDays) return {ok:false as const,reason:'date_range_too_large' as const,maxDays};
  const universe=await sql`SELECT id, symbol FROM securities WHERE active = true ORDER BY symbol`; const ids=new Map(universe.map(row=>[String(row.symbol).toUpperCase(),String(row.id)])); const symbols=[...ids.keys()];
  if(!symbols.length) return {ok:false as const,reason:'universe_empty' as const};

  const configured=input?.provider ?? (process.env.HISTORICAL_DATA_PROVIDER as Provider|'auto'|undefined) ?? 'auto';
  const provider:Provider=configured==='massive'||configured==='intrinio'||configured==='openbb' ? configured : (process.env.MASSIVE_API_KEY||process.env.MARKET_DATA_API_KEY ? 'massive' : process.env.INTRINIO_API_KEY ? 'intrinio' : process.env.OPENBB_API_URL ? 'openbb' : 'intrinio');
  const runId=randomUUID();
  await sql`INSERT INTO backfill_runs (id, provider, status, start_date, end_date, symbols_requested, shadow_only, started_at) VALUES (${runId},${provider},'running',${startDate},${endDate},${symbols.length},true,now())`;
  const pulled=provider==='massive' ? await pullMassive(days,new Set(symbols)) : provider==='intrinio' ? await pullIntrinio(symbols,startDate,endDate) : await pullOpenBb(symbols,startDate,endDate);
  let inserted=0;
  for(const bar of pulled.bars){ const securityId=ids.get(bar.symbol); if(!securityId) continue; const result=await sql`INSERT INTO historical_bars (id, security_id, timeframe, bar_time, open, high, low, close, volume, vwap, transactions, adjusted, source, payload) VALUES (${randomUUID()},${securityId},'1d',${bar.time},${bar.open??null},${bar.high??null},${bar.low??null},${bar.close},${bar.volume??null},${bar.vwap??null},${bar.transactions??null},true,${bar.source},${JSON.stringify({backfillRunId:runId, bridge:provider==='openbb'?'openbb':null})}::jsonb) ON CONFLICT (security_id,timeframe,bar_time,source) DO NOTHING RETURNING id`; inserted+=result.length; }
  const status=pulled.errors.length&&inserted===0?'failed':pulled.errors.length?'degraded':'completed';
  await sql`UPDATE backfill_runs SET status=${status}, bars_received=${pulled.bars.length}, bars_inserted=${inserted}, errors=${JSON.stringify(pulled.errors)}::jsonb, completed_at=now() WHERE id=${runId}`;
  return {ok:status!=='failed',runId,provider,startDate,endDate,symbolsRequested:symbols.length,barsReceived:pulled.bars.length,barsInserted:inserted,errors:pulled.errors,status,mode:'shadow' as const,capitalExecutionEnabled:false as const,completedAt:new Date().toISOString()};
}

export async function getHistoricalBackfillStatus(){ const sql=getSql(); if(!sql) return {available:false as const,reason:'database_not_configured' as const}; try{ const [latest]=await sql`SELECT * FROM backfill_runs ORDER BY started_at DESC LIMIT 1`; const [coverage]=await sql`SELECT count(*)::int AS bars, count(distinct security_id)::int AS securities, min(bar_time) AS first_bar, max(bar_time) AS last_bar FROM historical_bars`; return {available:true as const,mode:'shadow' as const,capitalExecutionEnabled:false as const,latest:latest??null,coverage:coverage??null}; } catch{return {available:false as const,reason:'historical_schema_not_initialized' as const};} }
