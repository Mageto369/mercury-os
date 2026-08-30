import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { resolveIntegrationBaseUrl } from "@/lib/admin/integration-runtime";
import { callSidecar } from "@/lib/integrations/sidecar-client";

type QuantStatsResponse = {
  ok: boolean;
  engine: string;
  scope: string;
  metrics: Record<string, number | null>;
  mode: "shadow";
  evidenceClass: "research";
  capitalExecutionEnabled: false;
};
type VectorBtResponse = {
  ok: boolean;
  engine: string;
  metrics: Record<string, unknown>;
  totalReturnPct: number | null;
  maxDrawdownPct: number | null;
  tradeCount: number;
  mode: "shadow";
  evidenceClass: "research";
  capitalExecutionEnabled: false;
};
type BacktraderResponse = {
  ok: boolean;
  engine: string;
  startValue: number;
  endValue: number;
  returnPct: number;
  parameters: Record<string, unknown>;
  mode: "shadow";
  evidenceClass: "research";
  capitalExecutionEnabled: false;
};
type HealthResponse = {
  ok: boolean;
  service: string;
  repositories: Record<string, string | null>;
  mode: "shadow";
  evidenceClass: "research";
  capitalExecutionEnabled: false;
};

async function runtime() {
  const url = await resolveIntegrationBaseUrl("research-proof-sidecar", [
    "RESEARCH_PROOF_URL",
    "VECTORBT_URL",
    "QUANTSTATS_URL",
    "BACKTRADER_URL",
    "YFINANCE_SIDECAR_URL",
  ]);
  return { url };
}

export async function getResearchProofStatus() {
  const { url } = await runtime();
  const result = await callSidecar<HealthResponse>(url, "/health");
  return result.ok
    ? {
        available: true as const,
        configured: true,
        ...result.data,
        latencyMs: result.latencyMs,
      }
    : {
        available: false as const,
        configured: Boolean(url),
        reason: result.reason,
        latencyMs: result.latencyMs,
        mode: "shadow" as const,
        capitalExecutionEnabled: false as const,
      };
}

export async function runResearchProofCycle() {
  const sql = getSql();
  if (!sql)
    return {
      ok: false as const,
      reason: "database_not_configured" as const,
      mode: "shadow" as const,
      capitalExecutionEnabled: false as const,
    };
  const { url } = await runtime();
  if (!url)
    return {
      ok: false as const,
      reason: "research_proof_sidecar_not_configured" as const,
      mode: "shadow" as const,
      capitalExecutionEnabled: false as const,
    };
  const rows =
    await sql`SELECT oo.evaluated_at,oo.return_60m FROM opportunity_outcomes oo JOIN opportunities o ON o.id=oo.opportunity_id JOIN securities s ON s.id=o.security_id WHERE oo.matured_60m=true AND oo.return_60m IS NOT NULL AND s.id NOT LIKE 'validation:%' ORDER BY oo.evaluated_at ASC LIMIT 1500`;
  const minimum = Math.max(
    20,
    Math.min(500, Number(process.env.RESEARCH_PROOF_MIN_OUTCOMES ?? 20)),
  );
  if (rows.length < minimum)
    return {
      ok: false as const,
      reason: "insufficient_live_outcomes" as const,
      samples: rows.length,
      required: minimum,
      mode: "shadow" as const,
      capitalExecutionEnabled: false as const,
    };
  const timestamps = rows.map((r) =>
    new Date(String(r.evaluated_at)).toISOString(),
  );
  const returns = rows.map((r) => Number(r.return_60m) / 100);
  const prices: number[] = [100];
  for (const value of returns.slice(1))
    prices.push(prices[prices.length - 1] * (1 + value));
  const quantstats = await callSidecar<QuantStatsResponse>(
    url,
    "/quantstats/proof",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamps, returns, scope: "live-60m-outcomes" }),
    },
  );
  const entries = prices.map((_, i) => i > 0 && i % 5 === 1);
  const exits = prices.map((_, i) => i > 1 && i % 5 === 4);
  const vectorbt = await callSidecar<VectorBtResponse>(
    url,
    "/vectorbt/experiment",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamps,
        prices,
        entries,
        exits,
        fees: 0.001,
        slippage: 0.001,
        init_cash: 100000,
      }),
    },
  );
  let backtrader: Awaited<
    ReturnType<typeof callSidecar<BacktraderResponse>>
  > | null = null;
  const [leader] =
    await sql`SELECT hb.security_id,count(*)::int AS bars FROM historical_bars hb JOIN securities s ON s.id=hb.security_id WHERE hb.timeframe='1d' AND s.id NOT LIKE 'validation:%' AND hb.open IS NOT NULL AND hb.high IS NOT NULL AND hb.low IS NOT NULL AND hb.close IS NOT NULL GROUP BY hb.security_id ORDER BY count(*) DESC LIMIT 1`;
  if (leader && Number(leader.bars) >= 40) {
    const bars =
      await sql`SELECT bar_time,open,high,low,close,volume FROM historical_bars WHERE security_id=${String(leader.security_id)} AND timeframe='1d' AND open IS NOT NULL AND high IS NOT NULL AND low IS NOT NULL AND close IS NOT NULL ORDER BY bar_time ASC LIMIT 500`;
    backtrader = await callSidecar<BacktraderResponse>(
      url,
      "/backtrader/challenger",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamps: bars.map((r) =>
            new Date(String(r.bar_time)).toISOString(),
          ),
          open: bars.map((r) => Number(r.open)),
          high: bars.map((r) => Number(r.high)),
          low: bars.map((r) => Number(r.low)),
          close: bars.map((r) => Number(r.close)),
          volume: bars.map((r) => Number(r.volume ?? 0)),
          fast: 10,
          slow: 30,
          commission: 0.001,
          cash: 100000,
        }),
      },
    );
  }
  const experimentId = randomUUID();
  await sql`INSERT INTO research_experiments (id,engine,model_version,hypothesis,dataset_hash,train_window,test_window,parameters,metrics,leakage_checks,status,shadow_only,started_at,completed_at) VALUES (${experimentId},'vectorbt+quantstats+backtrader',${process.env.MODEL_VERSION ?? "mercury-live-shadow-v1"},'Evaluate live 60m outcome series with independent research engines',null,${JSON.stringify({ samples: rows.length })}::jsonb,${JSON.stringify({ scope: "live-only" })}::jsonb,${JSON.stringify({ fees: 0.001, slippage: 0.001 })}::jsonb,${JSON.stringify({ quantstats: quantstats.ok ? quantstats.data : quantstats, vectorbt: vectorbt.ok ? vectorbt.data : vectorbt, backtrader: backtrader?.ok ? backtrader.data : backtrader })}::jsonb,${JSON.stringify({ syntheticValidationExcluded: true, capitalExecutionEnabled: false, yfinanceExcludedFromProof: true })}::jsonb,${quantstats.ok || vectorbt.ok ? "completed" : "degraded"},true,now(),now())`;
  if (quantstats.ok) {
    const m = quantstats.data.metrics;
    await sql`INSERT INTO proof_metrics (id,scope,model_version,as_of,expectancy,sharpe,sortino,calmar,max_drawdown,expected_shortfall,profit_factor,win_rate,monte_carlo_ruin_probability,metrics,source_engine,shadow_only) VALUES (${randomUUID()},'live-60m-outcomes',${process.env.MODEL_VERSION ?? "mercury-live-shadow-v1"},now(),null,${m.sharpe ?? null},${m.sortino ?? null},${m.calmar ?? null},${m.maxDrawdown ?? null},${m.expectedShortfall ?? null},${m.profitFactor ?? null},${m.winRate ?? null},null,${JSON.stringify(m)}::jsonb,'quantstats',true)`;
  }
  return {
    ok: Boolean(quantstats.ok || vectorbt.ok),
    experimentId,
    samples: rows.length,
    quantstats,
    vectorbt,
    backtrader,
    yfinance: { usedForProof: false, role: "quarantined-research-fallback" },
    mode: "shadow" as const,
    capitalExecutionEnabled: false as const,
    completedAt: new Date().toISOString(),
  };
}
