import { NextResponse } from "next/server";
import { runSupervisor } from "@/lib/agents/supervisor";
import { routeOperationalAlert } from "@/lib/alerts/router";
import { matureOpportunityOutcomes } from "@/lib/performance/outcomes";
import { refreshSourceReputation } from "@/lib/research/source-reputation";
import { buildShadowPortfolio } from "@/lib/portfolio/shadow-portfolio";
import { settleRestingOrders } from "@/lib/paper/order-engine";
import { pullAndPersistMarketData } from "@/lib/providers/market/router";
import { runOpenDataMesh } from "@/lib/providers/open-data/mesh";
import { runOpenIntelligenceSync } from "@/lib/integrations/open-intelligence-sync";
import { runDeepIntelligence } from "@/lib/intelligence/deep-intelligence";
import { buildEntityRelationshipGraph } from "@/lib/intelligence/entity-graph";
import { runSignalAttribution } from "@/lib/intelligence/signal-attribution";
import {
  getIngestionPolicies,
  recordIngestionResult,
  type IngestionPolicy,
} from "@/lib/admin/ingestion-runtime";
import type { IntelligenceJobName } from "@/lib/workflows/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

type SafeResult = { ok: false; reason: string } | Record<string, unknown>;
type RunStatus = "success" | "degraded" | "skipped";
type PipelineSummary = {
  status: RunStatus;
  error: string | null;
  components: Array<{ name: string; status: RunStatus; reason: string | null }>;
};

function statusOf(result: unknown): RunStatus {
  if (!result) return "degraded";
  if (result && typeof result === "object" && "status" in result) {
    const status = String((result as { status?: unknown }).status ?? "");
    if (status === "completed" || status === "success") return "success";
    if (status === "skipped") return "skipped";
    if (status === "degraded" || status === "failed") return "degraded";
  }
  return result &&
    typeof result === "object" &&
    "ok" in result &&
    (result as { ok?: boolean }).ok === false
    ? "degraded"
    : "success";
}
function reasonOf(result: unknown) {
  if (!result || typeof result !== "object") return "result_missing";
  if ("reason" in result)
    return String((result as { reason?: unknown }).reason ?? "degraded");
  if ("message" in result && statusOf(result) !== "success")
    return String((result as { message?: unknown }).message ?? "degraded");
  return null;
}
function nestedResult(result: unknown, key: string) {
  return result && typeof result === "object" && key in result
    ? (result as Record<string, unknown>)[key]
    : result;
}
function summarizePipeline(
  parts: Array<{ name: string; result: unknown }>,
): PipelineSummary {
  const components = parts.map(({ name, result }) => ({
    name,
    status: statusOf(result),
    reason: reasonOf(result),
  }));
  const status = components.every((part) => part.status === "success")
    ? "success"
    : components.every((part) => part.status === "skipped")
      ? "skipped"
      : "degraded";
  const errors = components
    .filter((part) => part.status !== "success")
    .map((part) => `${part.name}: ${part.reason ?? part.status}`);
  return { status, error: errors.join(" | ") || null, components };
}
async function record(
  policy: IngestionPolicy | undefined,
  summary: PipelineSummary,
) {
  if (policy?.due)
    await recordIngestionResult(policy, summary.status, summary.error);
}

async function runIntelligenceCycle(force = false) {
  const now = new Date();
  const ingestion = await getIngestionPolicies(now, force);
  const marketPolicy = ingestion["market-snapshots"];
  const openIntelDue = [
    "sec-filings",
    "share-structure",
    "macro-series",
    "corporate-actions",
  ].some((key) => ingestion[key]?.due);
  const openDataDue = ["sec-filings", "corporate-actions"].some(
    (key) => ingestion[key]?.due,
  );

  let marketRefresh: SafeResult;
  let openDataRefresh: SafeResult;
  let openIntelligenceRefresh: SafeResult;
  let entityGraph: SafeResult;
  let deepIntelligence: SafeResult;

  if (marketPolicy?.due) {
    try {
      marketRefresh = await pullAndPersistMarketData(marketPolicy.batchSize);
    } catch (error) {
      marketRefresh = {
        ok: false,
        reason:
          error instanceof Error ? error.message : "market_refresh_failed",
      };
    }
  } else
    marketRefresh = {
      ok: false,
      reason: marketPolicy?.enabled
        ? "not_due"
        : "disabled_by_ingestion_policy",
    };
  // Commit this pipeline's status before unrelated provider work. Otherwise
  // a timeout later in the cycle hides a successful market write and its cadence.
  const marketSummary = summarizePipeline([{name: "market-provider", result: marketRefresh}]);
  await record(marketPolicy, marketSummary);

  if (openDataDue) {
    try {
      openDataRefresh = await runOpenDataMesh();
    } catch (error) {
      openDataRefresh = {
        ok: false,
        reason:
          error instanceof Error ? error.message : "open_data_refresh_failed",
      };
    }
  } else
    openDataRefresh = {
      ok: false,
      reason: "not_due_or_disabled_by_ingestion_policy",
    };
  if (openIntelDue) {
    try {
      openIntelligenceRefresh = await runOpenIntelligenceSync();
    } catch (error) {
      openIntelligenceRefresh = {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "open_intelligence_refresh_failed",
      };
    }
  } else
    openIntelligenceRefresh = {
      ok: false,
      reason: "not_due_or_disabled_by_ingestion_policy",
    };

  const jobMap: Partial<Record<keyof typeof ingestion, IntelligenceJobName>> = {
    "social-radar": "social-radar",
    "sec-filings": "sec-filings",
    "share-structure": "share-structure",
    "corporate-actions": "finra-actions",
    "research-proof": "model-learning",
  };
  const requestedJobs = Object.entries(jobMap)
    .filter(([key]) => ingestion[key]?.due)
    .map(([, job]) => job!)
    .filter(Boolean);
  const result = await runSupervisor(now, requestedJobs, force ? "manual" : "cron");
  const assignment = (job: IntelligenceJobName) =>
    result.assignments.find((item) => item.job === job) ?? {
      status: "skipped",
      message: "workflow_not_requested",
    };
  const pipelineResults = {
    "market-snapshots": marketSummary,
    "sec-filings": summarizePipeline([
      { name: "company-facts", result: nestedResult(openDataRefresh, "sec") },
      { name: "recent-filings", result: assignment("sec-filings") },
    ]),
    "corporate-actions": summarizePipeline([
      { name: "finra-regsho", result: nestedResult(openDataRefresh, "finra") },
      { name: "corporate-action-agent", result: assignment("finra-actions") },
    ]),
    "share-structure": summarizePipeline([
      {
        name: "open-intelligence-identities",
        result: nestedResult(openIntelligenceRefresh, "identities"),
      },
      {
        name: "open-intelligence-form4",
        result: nestedResult(openIntelligenceRefresh, "form4"),
      },
      { name: "share-structure-agent", result: assignment("share-structure") },
    ]),
    "macro-series": summarizePipeline([
      {
        name: "open-intelligence-macro",
        result: nestedResult(openIntelligenceRefresh, "macro"),
      },
    ]),
    "social-radar": summarizePipeline([
      { name: "social-radar-agent", result: assignment("social-radar") },
    ]),
    "research-proof": summarizePipeline([
      { name: "model-learning-agent", result: assignment("model-learning") },
    ]),
  } satisfies Record<string, PipelineSummary>;
  await Promise.all(
    Object.entries(pipelineResults).filter(([key]) => key !== "market-snapshots").map(([key, summary]) =>
      record(ingestion[key], summary),
    ),
  );

  try {
    entityGraph = await buildEntityRelationshipGraph();
  } catch (error) {
    entityGraph = {
      ok: false,
      reason: error instanceof Error ? error.message : "entity_graph_failed",
    };
  }
  try {
    deepIntelligence = await runDeepIntelligence();
  } catch (error) {
    deepIntelligence = {
      ok: false,
      reason:
        error instanceof Error ? error.message : "deep_intelligence_failed",
    };
  }

  let outcomeMaturation:
    | Awaited<ReturnType<typeof matureOpportunityOutcomes>>
    | { ok: false; reason: string };
  let signalAttribution:
    | Awaited<ReturnType<typeof runSignalAttribution>>
    | { ok: false; reason: string };
  let sourceReputation:
    | Awaited<ReturnType<typeof refreshSourceReputation>>
    | { ok: false; reason: string };
  let shadowPortfolio:
    | Awaited<ReturnType<typeof buildShadowPortfolio>>
    | { ok: false; reason: string };
  let restingOrders:
    | Awaited<ReturnType<typeof settleRestingOrders>>
    | { ok: false; reason: string };
  try {
    outcomeMaturation = await matureOpportunityOutcomes(250);
  } catch (error) {
    outcomeMaturation = {
      ok: false,
      reason:
        error instanceof Error ? error.message : "outcome_maturation_failed",
    };
  }
  try {
    signalAttribution = await runSignalAttribution();
  } catch (error) {
    signalAttribution = {
      ok: false,
      reason:
        error instanceof Error ? error.message : "signal_attribution_failed",
    };
  }
  try {
    sourceReputation = await refreshSourceReputation();
  } catch (error) {
    sourceReputation = {
      ok: false,
      reason:
        error instanceof Error ? error.message : "source_reputation_failed",
    };
  }
  try {
    shadowPortfolio = await buildShadowPortfolio();
  } catch (error) {
    shadowPortfolio = {
      ok: false,
      reason:
        error instanceof Error ? error.message : "shadow_portfolio_failed",
    };
  }
  // Resting orders are the other half of the paper lifecycle: without this pass
  // an open limit order can never fill and a day order never expires.
  try {
    restingOrders = await settleRestingOrders(now);
  } catch (error) {
    restingOrders = {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "resting_order_settlement_failed",
    };
  }
  if ("outcomes" in restingOrders) {
    const transitioned = restingOrders.outcomes.filter(
      (outcome) => outcome.action !== "resting",
    );
    if (transitioned.length > 0) {
      await routeOperationalAlert({
        eventKey: `paper-settlement:${now.toISOString()}`,
        category: "paper",
        severity: "high",
        title: "Paper resting-order settlement",
        message: `${restingOrders.filled} filled, ${restingOrders.expired} expired, and ${restingOrders.rejected} rejected in the virtual ledger.`,
        payload: {
          filled: restingOrders.filled,
          expired: restingOrders.expired,
          rejected: restingOrders.rejected,
          orderIds: transitioned.map((outcome) => outcome.orderId),
          capitalExecutionEnabled: false,
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    mode: result.mode,
    autonomousExecution: false,
    capitalExecutionEnabled: false,
    supervisor: result.supervisor,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    dueJobs: result.dueJobs,
    completed: result.completed,
    degraded: result.degraded,
    skipped: result.skipped,
    persistedAudits: result.assignments.filter(
      (assignment) => assignment.persisted,
    ).length,
    escalations: result.escalations,
    ingestionPolicies: ingestion,
    forced: force,
    pipelineResults,
    marketRefresh,
    openDataRefresh,
    openIntelligenceRefresh,
    entityGraph,
    deepIntelligence,
    outcomeMaturation,
    signalAttribution,
    sourceReputation,
    shadowPortfolio,
    restingOrders,
    jobs: result.assignments,
  });
}

export async function GET() {
  return runIntelligenceCycle(false);
}

export async function POST() {
  return runIntelligenceCycle(true);
}
