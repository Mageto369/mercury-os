import { createHash } from 'node:crypto';
import { getSql } from '@/lib/db';
import { toJsonb } from '@/lib/db/json';

const hid=(...parts:unknown[])=>createHash('sha256').update(parts.join(':')).digest('hex');
const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
const norm=(v:unknown)=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');

export async function buildEntityRelationshipGraph(){
  const sql=getSql();
  if(!sql)return{ok:false as const,reason:'database_not_configured' as const,shadowOnly:true,capitalExecutionEnabled:false};

  const insiders=await sql<any[]>`SELECT security_id,owner_name,owner_role,transaction_code,count(*)::int observations FROM insider_transactions it JOIN securities s ON s.id=it.security_id WHERE it.owner_name IS NOT NULL AND s.id NOT LIKE 'validation:%' GROUP BY security_id,owner_name,owner_role,transaction_code`;
  const institutions=await sql<any[]>`SELECT security_id,manager_cik,manager_name,count(*)::int observations FROM institutional_holdings ih JOIN securities s ON s.id=ih.security_id WHERE (ih.manager_cik IS NOT NULL OR ih.manager_name IS NOT NULL) AND s.id NOT LIKE 'validation:%' GROUP BY security_id,manager_cik,manager_name`;
  const financings=await sql<any[]>`SELECT security_id,event_type,form,count(*)::int observations FROM financing_events fe JOIN securities s ON s.id=fe.security_id WHERE s.id NOT LIKE 'validation:%' GROUP BY security_id,event_type,form`;

  let inserted=0;
  for(const r of insiders){
    const ref=norm(r.owner_name); if(!ref)continue;
    const repeat=await sql<any[]>`SELECT count(DISTINCT security_id)::int c FROM insider_transactions WHERE lower(trim(owner_name))=${ref}`;
    const cross=Number(repeat[0]?.c??1);
    const risk=clamp((cross-1)*12+(String(r.transaction_code).toUpperCase()==='S'?8:0));
    const res=await sql`INSERT INTO entity_relationships(id,security_id,entity_type,entity_ref,relationship_type,related_entity_type,related_entity_ref,risk_score,confidence,source,evidence,observed_at) VALUES(${hid('insider',r.security_id,ref,r.owner_role,r.transaction_code)},${r.security_id},'person',${r.owner_name},${`insider:${r.owner_role??'unknown'}:${r.transaction_code??'unknown'}`},'security',${r.security_id},${risk},85,'sec-form4',${toJsonb({observations:r.observations,crossIssuerCount:cross})}::jsonb,now()) ON CONFLICT(id) DO NOTHING RETURNING id`;
    inserted+=res.length;
  }
  for(const r of institutions){
    const ref=norm(r.manager_cik||r.manager_name); if(!ref)continue;
    const repeat=await sql<any[]>`SELECT count(DISTINCT security_id)::int c FROM institutional_holdings WHERE lower(trim(coalesce(manager_cik,manager_name)))=${ref}`;
    const cross=Number(repeat[0]?.c??1),risk=clamp((cross-3)*4);
    const res=await sql`INSERT INTO entity_relationships(id,security_id,entity_type,entity_ref,relationship_type,related_entity_type,related_entity_ref,risk_score,confidence,source,evidence,observed_at) VALUES(${hid('institution',r.security_id,ref)},${r.security_id},'institution',${r.manager_name||r.manager_cik},'institutional-holder','security',${r.security_id},${risk},75,'sec-13f',${toJsonb({observations:r.observations,crossIssuerCount:cross,managerCik:r.manager_cik})}::jsonb,now()) ON CONFLICT(id) DO NOTHING RETURNING id`;
    inserted+=res.length;
  }
  for(const r of financings){
    const ref=`${r.event_type}:${r.form??'unknown'}`;
    const res=await sql`INSERT INTO entity_relationships(id,security_id,entity_type,entity_ref,relationship_type,related_entity_type,related_entity_ref,risk_score,confidence,source,evidence,observed_at) VALUES(${hid('financing',r.security_id,ref)},${r.security_id},'financing-pattern',${ref},'financing-history','security',${r.security_id},${clamp(Number(r.observations)*10)},80,'sec-edgar',${toJsonb({observations:r.observations,eventType:r.event_type,form:r.form})}::jsonb,now()) ON CONFLICT(id) DO NOTHING RETURNING id`;
    inserted+=res.length;
  }

  const [summary]=await sql<any[]>`SELECT count(*)::int edges,count(DISTINCT entity_type||':'||entity_ref)::int entities,count(*) FILTER(WHERE risk_score>=50)::int elevated_edges FROM entity_relationships er LEFT JOIN securities s ON s.id=er.security_id WHERE er.security_id IS NULL OR s.id NOT LIKE 'validation:%'`;
  return{ok:true as const,inserted,edges:Number(summary?.edges??0),entities:Number(summary?.entities??0),elevatedEdges:Number(summary?.elevated_edges??0),evidenceScope:'live' as const,shadowOnly:true as const,capitalExecutionEnabled:false as const};
}

export async function getEntityGraphStatus(){
  const sql=getSql(); if(!sql)return{available:false as const,reason:'database_not_configured' as const,shadowOnly:true,capitalExecutionEnabled:false};
  const [x]=await sql<any[]>`SELECT count(*)::int edges,count(DISTINCT entity_type||':'||entity_ref)::int entities,count(*) FILTER(WHERE risk_score>=50)::int elevated_edges FROM entity_relationships`;
  return{available:true as const,...x,evidenceScope:'live' as const,shadowOnly:true as const,capitalExecutionEnabled:false as const};
}
