import { createHash, randomUUID } from 'node:crypto';
import { getSql } from '@/lib/db';
import { bootstrapOpenDataMesh } from '@/lib/db/bootstrap-open-data';
import { getSecUserAgent } from '@/lib/providers/sec-identity';

function cik10(cik: string) { return cik.replace(/\D/g, '').padStart(10, '0').slice(-10); }
function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

async function health(provider: string, configured: boolean, authoritative: boolean, result: { ok: boolean; latencyMs: number; records: number; error?: string }) {
  const sql = getSql(); if (!sql) return;
  await sql`INSERT INTO provider_health (provider, provider_group, configured, authoritative, last_status, consecutive_failures, last_success_at, last_failure_at, latency_ms, records_received, last_error, metadata, updated_at)
    VALUES (${provider}, 'open-data', ${configured}, ${authoritative}, ${result.ok ? 'healthy' : 'degraded'}, ${result.ok ? 0 : 1}, ${result.ok ? new Date().toISOString() : null}, ${result.ok ? null : new Date().toISOString()}, ${result.latencyMs}, ${result.records}, ${result.error ?? null}, ${JSON.stringify({ shadowOnly: true })}::jsonb, now())
    ON CONFLICT (provider) DO UPDATE SET configured=EXCLUDED.configured, authoritative=EXCLUDED.authoritative, last_status=EXCLUDED.last_status,
    consecutive_failures=CASE WHEN EXCLUDED.last_status='healthy' THEN 0 ELSE provider_health.consecutive_failures+1 END,
    last_success_at=COALESCE(EXCLUDED.last_success_at, provider_health.last_success_at), last_failure_at=COALESCE(EXCLUDED.last_failure_at, provider_health.last_failure_at),
    latency_ms=EXCLUDED.latency_ms, records_received=EXCLUDED.records_received, last_error=EXCLUDED.last_error, metadata=EXCLUDED.metadata, updated_at=now()`;
}

export async function pullSecCompanyFacts(limit = 25) {
  const sql = getSql(); if (!sql) return { ok:false as const, reason:'database_not_configured' as const };
  await bootstrapOpenDataMesh();
  const ua = getSecUserAgent(); const started = Date.now();
  const rows = await sql`SELECT id, cik FROM securities WHERE active=true AND cik IS NOT NULL ORDER BY symbol LIMIT ${Math.max(1, Math.min(200, limit))}`;
  let inserted = 0; const errors:string[]=[];
  for (const row of rows) {
    try {
      const cik = cik10(String(row.cik));
      const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {headers:{'User-Agent':ua, Accept:'application/json'}, cache:'no-store'});
      if (!r.ok) throw new Error(`http_${r.status}`);
      const data = await r.json() as { facts?: Record<string, Record<string, { units?: Record<string, Array<Record<string, unknown>>> }>> };
      for (const [taxonomy, concepts] of Object.entries(data.facts ?? {})) for (const [concept, spec] of Object.entries(concepts)) for (const [unit, facts] of Object.entries(spec.units ?? {})) for (const fact of facts.slice(-12)) {
        const val = Number(fact.val); if (!Number.isFinite(val)) continue;
        const accession = String(fact.accn ?? ''); const end = String(fact.end ?? '');
        const id = hash(['sec', row.id, taxonomy, concept, unit, accession, end]);
        const q = await sql`INSERT INTO sec_company_facts (id, security_id, cik, taxonomy, concept, unit, value, form, accession_number, filed_at, period_start, period_end, fiscal_year, fiscal_period, frame, payload)
          VALUES (${id}, ${String(row.id)}, ${cik}, ${taxonomy}, ${concept}, ${unit}, ${val}, ${String(fact.form ?? '') || null}, ${accession || null}, ${fact.filed ? new Date(String(fact.filed)) : null}, ${fact.start ? String(fact.start) : null}, ${end || null}, ${fact.fy ? Number(fact.fy) : null}, ${String(fact.fp ?? '') || null}, ${String(fact.frame ?? '') || null}, ${JSON.stringify(fact)}::jsonb)
          ON CONFLICT DO NOTHING RETURNING id`;
        inserted += q.length;
      }
    } catch (e) { errors.push(e instanceof Error ? e.message : 'sec_companyfacts_failed'); }
  }
  await health('sec-companyfacts', true, true, {ok: inserted>0 || errors.length===0, latencyMs:Date.now()-started, records:inserted, error:errors[0]});
  return {ok: errors.length < rows.length, provider:'sec-companyfacts', authoritative:true, inserted, errors, mode:'shadow' as const, capitalExecutionEnabled:false as const};
}

export async function pullFinraRegSho(limit = 5000) {
  const sql = getSql(); if (!sql) return {ok:false as const, reason:'database_not_configured' as const};
  await bootstrapOpenDataMesh(); const started=Date.now();
  try {
    const r = await fetch('https://api.finra.org/data/group/otcMarket/name/regShoDaily', {method:'POST', headers:{'Content-Type':'application/json', Accept:'application/json'}, body:JSON.stringify({limit:Math.max(1,Math.min(5000,limit)), fields:['tradeReportDate','securitiesInformationProcessorSymbolIdentifier','marketCode','reportingFacilityCode','totalParQuantity','shortParQuantity','shortExemptParQuantity']}), cache:'no-store'});
    if (!r.ok) throw new Error(`http_${r.status}`);
    const data = await r.json() as Array<Record<string, unknown>>;
    const universe = await sql`SELECT id, symbol FROM securities`; const ids=new Map(universe.map(x=>[String(x.symbol).toUpperCase(),String(x.id)]));
    let inserted=0;
    for (const x of data) {
      const symbol=String(x.securitiesInformationProcessorSymbolIdentifier ?? '').toUpperCase(); const date=String(x.tradeReportDate ?? ''); if(!symbol||!date) continue;
      const total=Number(x.totalParQuantity ?? 0), short=Number(x.shortParQuantity ?? 0), exempt=Number(x.shortExemptParQuantity ?? 0);
      const q=await sql`INSERT INTO finra_regsho_daily (id, security_id, symbol, trade_date, market_code, reporting_facility, total_quantity, short_quantity, short_exempt_quantity, short_ratio, payload)
        VALUES (${hash(['finra',symbol,date,x.marketCode,x.reportingFacilityCode])}, ${ids.get(symbol) ?? null}, ${symbol}, ${date}, ${String(x.marketCode ?? '') || null}, ${String(x.reportingFacilityCode ?? '') || null}, ${total}, ${short}, ${exempt}, ${total>0 ? short/total : null}, ${JSON.stringify(x)}::jsonb)
        ON CONFLICT DO NOTHING RETURNING id`; inserted+=q.length;
    }
    await health('finra-regsho', true, true, {ok:true, latencyMs:Date.now()-started, records:inserted});
    return {ok:true as const, provider:'finra-regsho', authoritative:true, received:data.length, inserted, mode:'shadow' as const, capitalExecutionEnabled:false as const};
  } catch(e) { const msg=e instanceof Error?e.message:'finra_regsho_failed'; await health('finra-regsho', true, true, {ok:false,latencyMs:Date.now()-started,records:0,error:msg}); return {ok:false as const, reason:msg}; }
}

export async function getOpenDataStatus() {
  const sql=getSql();
  if(!sql) return {available:false as const, reason:'database_not_configured' as const, mode:'shadow' as const, capitalExecutionEnabled:false as const, providers:[{provider:'sec-companyfacts',authoritative:true,configured:true},{provider:'finra-regsho',authoritative:true,configured:true},{provider:'openbb',authoritative:false,configured:Boolean(process.env.OPENBB_API_URL)}]};
  try { const providers=await sql`SELECT * FROM provider_health WHERE provider_group='open-data' ORDER BY provider`; return {available:true as const, mode:'shadow' as const, capitalExecutionEnabled:false as const, providers, openbb:{configured:Boolean(process.env.OPENBB_API_URL), role:'optional-provider-bridge'}}; }
  catch { return {available:false as const, reason:'open_data_schema_not_initialized' as const, mode:'shadow' as const, capitalExecutionEnabled:false as const}; }
}

export async function runOpenDataMesh() {
  const [sec, finra] = await Promise.all([pullSecCompanyFacts(Number(process.env.SEC_FACTS_MAX_COMPANIES ?? 25)), pullFinraRegSho(Number(process.env.FINRA_REGSHO_LIMIT ?? 5000))]);
  return {ok:Boolean(sec.ok || finra.ok), sec, finra, mode:'shadow' as const, capitalExecutionEnabled:false as const, completedAt:new Date().toISOString()};
}
