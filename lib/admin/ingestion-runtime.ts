import { getSql } from '@/lib/db';
import { ingestionCatalog } from '@/lib/admin/catalog';

export type IngestionPolicy={key:string;displayName:string;enabled:boolean;cadenceMinutes:number;batchSize:number;lastRunAt:string|null;lastStatus:string;due:boolean;settings:Record<string,unknown>};

export async function getIngestionPolicies(now=new Date(),force=false):Promise<Record<string,IngestionPolicy>>{
 const sql=getSql();
 const saved=sql?await sql`select pipeline_key,display_name,enabled,cadence_minutes,batch_size,last_run_at,last_status,settings from ingestion_settings`:[];
 const byKey=new Map(saved.map((r:any)=>[String(r.pipeline_key),r]));
 return Object.fromEntries(ingestionCatalog.map(def=>{
  const row=byKey.get(def.key) as any;
  const enabled=row?Boolean(row.enabled):true;
  const cadence=Math.max(1,Math.min(10080,Number(row?.cadence_minutes??def.cadenceMinutes)));
  const last=row?.last_run_at?new Date(row.last_run_at):null;
  const due=enabled&&(force||!last||now.getTime()-last.getTime()>=cadence*60_000);
  const policy:IngestionPolicy={key:def.key,displayName:String(row?.display_name??def.displayName),enabled,cadenceMinutes:cadence,batchSize:Math.max(1,Math.min(10000,Number(row?.batch_size??def.batchSize))),lastRunAt:last?.toISOString()??null,lastStatus:String(row?.last_status??'never_run'),due,settings:row?.settings&&typeof row.settings==='object'?row.settings:{}};
  return [def.key,policy];
 }));
}

export async function recordIngestionResult(policy:IngestionPolicy,status:'success'|'degraded'|'skipped',error?:string|null){
 const sql=getSql();if(!sql)return;
 // Serialised explicitly rather than through sql.json(): under the Next.js
 // production bundle that wrapper reaches the driver unrecognised and throws
 // ERR_INVALID_ARG_TYPE, which failed the entire cron cycle with a 500.
 const settingsJson=JSON.stringify(policy.settings ?? {});
 await sql`insert into ingestion_settings(id,pipeline_key,display_name,enabled,cadence_minutes,batch_size,source_priority,settings,last_run_at,last_status,last_error,updated_at)
 values(${`ingestion:${policy.key}`},${policy.key},${policy.displayName},${policy.enabled},${policy.cadenceMinutes},${policy.batchSize},'[]'::jsonb,${settingsJson}::jsonb,now(),${status},${error??null},now())
 on conflict(pipeline_key) do update set last_run_at=excluded.last_run_at,last_status=excluded.last_status,last_error=excluded.last_error,updated_at=now()`;
}
