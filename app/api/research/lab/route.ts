import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { getHistoricalTwins } from "@/lib/research/historical-twins";
import { runBootstrapMonteCarlo } from "@/lib/research/monte-carlo";
import {
  countSurvivors,
  summarizeProvenance,
} from "@/lib/performance/provenance";
import { toJsonb } from "@/lib/db/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ExperimentSchema = z.object({
  engine: z.enum(["internal", "vectorbt", "backtrader"]).default("internal"),
  hypothesis: z.string().trim().min(8).max(3000),
  modelVersion: z.string().max(200).optional(),
  parameters: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .default({}),
  trainStart: z.string().optional(),
  trainEnd: z.string().optional(),
  testStart: z.string().optional(),
  testEnd: z.string().optional(),
});

export async function GET(request: Request) {
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
  const url = new URL(request.url);
  const opportunityId = url.searchParams.get("opportunityId");
  try {
    const replayRuns =
      await sql`select id,model_version,status,lookback_days,opportunities_reviewed,decisions_reviewed,drift_detected,metrics,started_at,completed_at from replay_runs order by started_at desc limit 100`;
    const experiments =
      await sql`select id,engine,model_version,hypothesis,dataset_hash,train_window,test_window,parameters,metrics,leakage_checks,status,shadow_only,started_at,completed_at from research_experiments order by started_at desc limit 100`;
    const evidence =
      await sql`select id,experiment_id,model_version,regime,dataset_hash,point_in_time,walk_forward,leakage_passed,transaction_costs_included,metrics,created_at from replay_evidence order by created_at desc limit 100`;
    const proof =
      await sql`select id,scope,model_version,as_of,expectancy,sharpe,sortino,calmar,max_drawdown,expected_shortfall,profit_factor,win_rate,monte_carlo_ruin_probability,metrics,source_engine,shadow_only from proof_metrics order by as_of desc limit 100`;
    const gates =
      await sql`select id,model_version,evidence_scope,sample_size,regimes,net_expectancy,max_drawdown,rolling_stability,capacity_score,stress_survival,ex_top_winners_expectancy,synthetic_rows,passed,reasons,evaluated_at from economic_proof_gates where evidence_scope='live' order by evaluated_at desc limit 50`;
    // Pre-filter census, counted without the provenance predicate so the audit
    // can demonstrate that filtering removed something rather than restating
    // the predicate back to itself.
    const [provenanceCensus] =
      await sql`select count(*)::int candidate_rows,count(*) filter(where s.id like 'validation:%')::int synthetic_candidates from opportunity_outcomes oo join securities s on s.id=oo.security_id where oo.matured_60m=true and oo.return_60m is not null`;
    const returnsRows =
      await sql`select oo.return_60m,oo.security_id from opportunity_outcomes oo join securities s on s.id=oo.security_id where oo.matured_60m=true and oo.return_60m is not null and s.id not like 'validation:%' order by oo.evaluated_at desc limit 5000`;
    const survivors = countSurvivors(returnsRows);
    const evidenceProvenance = summarizeProvenance("live", {
      candidateRows: Number(provenanceCensus?.candidate_rows ?? 0),
      syntheticCandidates: Number(provenanceCensus?.synthetic_candidates ?? 0),
      syntheticSurviving: survivors.syntheticSurviving,
      liveSurviving: survivors.liveSurviving,
    });
    const returns = returnsRows
      .map((r) => Number(r.return_60m))
      .filter(Number.isFinite);
    const monteCarloResult = runBootstrapMonteCarlo(returns);
    const twins = opportunityId
      ? await getHistoricalTwins(opportunityId, 30)
      : null;
    const latestGate = gates[0] ?? null;
    const ladder = [
      { stage: "DISCOVERED", status: "available" },
      { stage: "OBSERVED", status: returns.length ? "evidence" : "waiting" },
      {
        stage: "CONFIRMED",
        status:
          Number(latestGate?.sample_size ?? 0) >= 100 ? "evidence" : "waiting",
      },
      {
        stage: "QUALIFIED",
        status:
          Number(latestGate?.sample_size ?? 0) >= 500 ? "evidence" : "waiting",
      },
      { stage: "SHADOW", status: "active" },
      { stage: "PROVEN", status: latestGate?.passed ? "passed" : "locked" },
      {
        stage: "PAPER",
        status: latestGate?.passed ? "eligible" : "active_manual",
      },
      { stage: "LIMITED CAPITAL", status: "locked" },
      { stage: "SCALED", status: "locked" },
    ];
    return NextResponse.json({
      ok: true,
      mode: "research-shadow",
      evidenceScope: "live-only",
      replayRuns,
      experiments,
      replayEvidence: evidence,
      proofMetrics: proof,
      economicProofGates: gates,
      monteCarlo: monteCarloResult,
      evidenceProvenance,
      historicalTwins: twins,
      evidenceLadder: ladder,
      capitalExecutionEnabled: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "research_lab_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
        capitalExecutionEnabled: false,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const parsed = ExperimentSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_experiment",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  const sql = getSql();
  if (!sql)
    return NextResponse.json(
      { ok: false, error: "database_not_configured" },
      { status: 503 },
    );
  try {
    const id = `research:${randomUUID()}`;
    const trainWindow = {
      start: parsed.data.trainStart ?? null,
      end: parsed.data.trainEnd ?? null,
    };
    const testWindow = {
      start: parsed.data.testStart ?? null,
      end: parsed.data.testEnd ?? null,
    };
    await sql`insert into research_experiments(id,engine,model_version,hypothesis,train_window,test_window,parameters,leakage_checks,status,shadow_only) values(${id},${parsed.data.engine},${parsed.data.modelVersion ?? null},${parsed.data.hypothesis},${toJsonb(trainWindow)}::jsonb,${toJsonb(testWindow)}::jsonb,${toJsonb(parsed.data.parameters)}::jsonb,${toJsonb({ pointInTimeRequired: true, futureLeakageForbidden: true, transactionCostsRequired: true })}::jsonb,'queued',true)`;
    return NextResponse.json({
      ok: true,
      id,
      status: "queued",
      engine: parsed.data.engine,
      shadowOnly: true,
      capitalExecutionEnabled: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "research_experiment_create_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
        capitalExecutionEnabled: false,
      },
      { status: 500 },
    );
  }
}
