import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  countSurvivors,
  summarizeProvenance,
} from "@/lib/performance/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const sql = getSql();
  if (!sql)
    return NextResponse.json(
      {
        ok: false,
        error: "database_not_configured",
        capitalExecutionEnabled: false,
      },
      { status: 503 },
    );
  try {
    const pipelines =
      await sql`select pipeline_key,display_name,enabled,cadence_minutes,batch_size,source_priority,last_run_at,last_status,last_error,updated_at from ingestion_settings order by display_name`;
    const providers =
      await sql`select provider,provider_group,configured,authoritative,last_status,consecutive_failures,last_success_at,last_failure_at,latency_ms,records_received,last_error,updated_at from provider_health order by provider_group,provider`;
    const workflows =
      await sql`select id,workflow,status,trigger,started_at,completed_at,stats,error from workflow_runs order by started_at desc limit 100`;
    const [counts] =
      await sql`select (select count(*)::int from securities where id not like 'validation:%') as securities,(select count(*)::int from market_snapshots ms join securities s on s.id=ms.security_id where s.id not like 'validation:%') as market_snapshots,(select count(*)::int from opportunities o join securities s on s.id=o.security_id where s.id not like 'validation:%') as opportunities,(select count(*)::int from filings f join securities s on s.id=f.security_id where s.id not like 'validation:%') as filings,(select count(*)::int from historical_bars h join securities s on s.id=h.security_id where s.id not like 'validation:%') as historical_bars,(select count(*)::int from paper_orders) as paper_orders`;
    const [quality] =
      await sql`select (select count(*)::int from securities where symbol is null or btrim(symbol)='') as missing_symbols,(select count(*)::int from market_snapshots where price<=0) as invalid_prices,(select count(*)::int from market_snapshots where observed_at<now()-interval '1 day') as stale_snapshots,(select count(*)::int from (select security_id,observed_at,count(*) c from market_snapshots group by security_id,observed_at having count(*)>1)x) as duplicate_snapshot_keys,(select count(*)::int from opportunities o join securities s on s.id=o.security_id where s.id like 'validation:%') as validation_opportunities`;
    const [provenanceCensus] =
      await sql`select count(*)::int as candidate_rows,count(*) filter(where s.id like 'validation:%')::int as synthetic_candidates from opportunities o join securities s on s.id=o.security_id`;
    // Survivors are read back from the filtered evidence set rather than assumed.
    // Passing a literal 0 here made provenanceSafe unfalsifiable, which is exactly
    // the failure this panel exists to catch.
    const provenanceSurvivors =
      await sql`select o.security_id from opportunities o join securities s on s.id=o.security_id where s.id not like 'validation:%'`;
    const events =
      await sql`select id,event_key,category,severity,source,message,observed_at from system_events order by observed_at desc limit 150`;
    const adminAudit =
      await sql`select id,action,target_type,target_ref,outcome,metadata,created_at from admin_audit_log order by created_at desc limit 100`;
    const alerts =
      await sql`select id,event_key,severity,channel,destination,status,shadow_only,attempts,error,created_at,delivered_at,payload->>'ruleKey' as rule_key,payload->>'ruleName' as rule_name,payload->>'reason' as reason from alert_deliveries order by created_at desc limit 100`;
    const [deliveryHealth] =
      await sql`select count(*) filter(where status='delivered')::int as delivered,count(*) filter(where status='skipped')::int as skipped,count(*) filter(where status='unavailable')::int as unavailable,count(*) filter(where status='failed')::int as failed,count(*)::int as total from alert_deliveries where created_at>=now()-interval '24 hours'`;
    const undeliveredRules =
      await sql`select nr.rule_key,nr.display_name,nr.channel,nr.enabled from notification_rules nr where nr.enabled=true and not exists(select 1 from alert_deliveries ad where ad.payload->>'ruleKey'=nr.rule_key and ad.status='delivered') order by nr.rule_key`;
    const rules =
      await sql`select id,rule_key,display_name,category,enabled,minimum_severity,channel,destination,conditions,cooldown_minutes,shadow_only,updated_at from notification_rules order by category,display_name`;
    const [agents] =
      await sql`select count(*)::int as total,count(*) filter(where status in('healthy','idle','running'))::int as healthy,count(*) filter(where consecutive_failures>0)::int as failing from agent_heartbeats`;
    const [proof] =
      await sql`select sample_size,passed,evaluated_at from economic_proof_gates where evidence_scope='live' order by evaluated_at desc limit 1`;
    const configuredProviders = providers.filter(
      (p: any) => p.configured,
    ).length;
    const healthyProviders = providers.filter(
      (p: any) => p.last_status === "success" || p.last_status === "healthy",
    ).length;
    const qualityIssues = Object.values(quality ?? {}).reduce(
      (s, v) => s + Number(v ?? 0),
      0,
    );
    const readiness = {
      database: true,
      schema: true,
      liveUniverse: Number(counts?.securities ?? 0) > 0,
      marketData: Number(counts?.market_snapshots ?? 0) > 0,
      providersConfigured: configuredProviders,
      providersHealthy: healthyProviders,
      agentsTotal: Number(agents?.total ?? 0),
      agentsHealthy: Number(agents?.healthy ?? 0),
      qualityIssues,
      accessMode: "personal-server-open",
      paperAccount: true,
      economicProofPassed: Boolean(proof?.passed),
      economicProofSampleSize: Number(proof?.sample_size ?? 0),
      capitalExecutionEnabled: false,
    };
    return NextResponse.json({
      ok: true,
      pipelines,
      providers,
      workflows,
      dataQuality: { counts, checks: quality, issueCount: qualityIssues },
      audit: { systemEvents: events, admin: adminAudit },
      notifications: {
        rules,
        deliveries: alerts,
        deliveryHealth: deliveryHealth ?? null,
        rulesNeverDelivered: undeliveredRules,
      },
      evidenceProvenance: summarizeProvenance("live", {
        candidateRows: Number(provenanceCensus?.candidate_rows ?? 0),
        syntheticCandidates: Number(
          provenanceCensus?.synthetic_candidates ?? 0,
        ),
        ...countSurvivors(
          provenanceSurvivors as Array<Record<string, unknown>>,
        ),
      }),
      readiness,
      capitalExecutionEnabled: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "operations_center_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
        capitalExecutionEnabled: false,
      },
      { status: 500 },
    );
  }
}
