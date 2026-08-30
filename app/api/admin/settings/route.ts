import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { integrationCatalog, ingestionCatalog } from "@/lib/admin/catalog";
import { encryptSecret } from "@/lib/admin/vault";
import { getSql } from "@/lib/db";
import { toJsonb } from "@/lib/db/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const integrationSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  baseUrl: z.string().url().or(z.literal("")).optional(),
  model: z.string().max(120).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  secret: z.string().min(1).max(10000).optional(),
  secretName: z.string().max(80).default("api_key"),
});
const ingestionSchema = z.object({
  pipelineKey: z.string().min(1),
  enabled: z.boolean(),
  cadenceMinutes: z.number().int().min(1).max(10080),
  batchSize: z.number().int().min(1).max(10000),
  sourcePriority: z.array(z.string()).max(20).default([]),
  settings: z.record(z.string(), z.unknown()).optional(),
});

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

export async function GET() {
  const sql = getSql();
  if (!sql)
    return NextResponse.json(
      { ok: false, error: "database_not_configured" },
      { status: 503 },
    );
  const integrations = await sql<
    any[]
  >`select c.*, exists(select 1 from integration_secrets s where s.integration_id=c.id) as secret_configured, (select masked_hint from integration_secrets s where s.integration_id=c.id order by s.updated_at desc limit 1) as masked_hint from integration_configs c order by category,display_name`;
  const ingestion = await sql<
    any[]
  >`select * from ingestion_settings order by display_name`;
  const monitoring = await sql<
    any[]
  >`select * from monitoring_checks order by category,display_name`;
  const audit = await sql<
    any[]
  >`select action,target_type,target_ref,outcome,metadata,created_at from admin_audit_log order by created_at desc limit 50`;
  return NextResponse.json({
    ok: true,
    credentialStorage: "plaintext",
    catalog: integrationCatalog,
    ingestionCatalog,
    integrations,
    ingestion,
    monitoring,
    audit,
    capitalExecutionEnabled: false,
  });
}

export async function PUT(request: Request) {
  const sql = getSql();
  if (!sql)
    return NextResponse.json(
      { ok: false, error: "database_not_configured" },
      { status: 503 },
    );
  const body = (await request.json().catch(() => null)) as any;
  if (body?.type === "integration") {
    const parsed = integrationSchema.safeParse(body.value);
    if (!parsed.success)
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_integration",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    const v = parsed.data;
    const cat = integrationCatalog.find((x) => x.id === v.id);
    if (!cat)
      return NextResponse.json(
        { ok: false, error: "unknown_integration" },
        { status: 404 },
      );
    await sql`insert into integration_configs(id,category,provider,display_name,base_url,model,enabled,capabilities,settings,updated_at) values(${v.id},${cat.category},${cat.provider},${cat.displayName},${v.baseUrl || null},${v.model || null},${v.enabled},${toJsonb([...cat.capabilities])}::jsonb,${toJsonb(jsonSafe(v.settings))}::jsonb,now()) on conflict(id) do update set base_url=excluded.base_url,model=excluded.model,enabled=excluded.enabled,settings=excluded.settings,updated_at=now()`;
    if (v.secret) {
      const enc = encryptSecret(v.secret);
      await sql`insert into integration_secrets(id,integration_id,secret_name,ciphertext,iv,auth_tag,masked_hint,updated_at) values(${randomUUID()},${v.id},${v.secretName},${enc.ciphertext},${enc.iv},${enc.authTag},${enc.maskedHint},now()) on conflict(integration_id,secret_name) do update set ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,masked_hint=excluded.masked_hint,updated_at=now()`;
    }
    await sql`insert into admin_audit_log(id,action,target_type,target_ref,outcome,metadata) values(${randomUUID()},'update','integration',${v.id},'success',${toJsonb({ enabled: v.enabled, secretRotated: Boolean(v.secret) })}::jsonb)`;
    return NextResponse.json({ ok: true });
  }
  if (body?.type === "ingestion") {
    const parsed = ingestionSchema.safeParse(body.value);
    if (!parsed.success)
      return NextResponse.json(
        { ok: false, error: "invalid_ingestion", issues: parsed.error.issues },
        { status: 400 },
      );
    const v = parsed.data;
    const cat = ingestionCatalog.find((x) => x.key === v.pipelineKey);
    if (!cat)
      return NextResponse.json(
        { ok: false, error: "unknown_pipeline" },
        { status: 404 },
      );
    await sql`insert into ingestion_settings(id,pipeline_key,display_name,enabled,cadence_minutes,batch_size,source_priority,settings,updated_at) values(${v.pipelineKey},${v.pipelineKey},${cat.displayName},${v.enabled},${v.cadenceMinutes},${v.batchSize},${toJsonb(v.sourcePriority)}::jsonb,${toJsonb(jsonSafe(v.settings))}::jsonb,now()) on conflict(pipeline_key) do update set enabled=excluded.enabled,cadence_minutes=excluded.cadence_minutes,batch_size=excluded.batch_size,source_priority=excluded.source_priority,settings=excluded.settings,updated_at=now()`;
    await sql`insert into admin_audit_log(id,action,target_type,target_ref,outcome,metadata) values(${randomUUID()},'update','ingestion',${v.pipelineKey},'success',${toJsonb({ enabled: v.enabled, cadenceMinutes: v.cadenceMinutes, batchSize: v.batchSize })}::jsonb)`;
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { ok: false, error: "invalid_request" },
    { status: 400 },
  );
}
