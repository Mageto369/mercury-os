/**
 * Derive a single, honest operator-facing system posture from /api/health.
 *
 * Mercury's workspaces previously rendered zero rows whether the warehouse was
 * empty, the database was unconfigured, or ingestion had never run. Those are
 * three completely different situations and only one of them is normal. This
 * module turns the health payload into a posture plus concrete blockers, so
 * every surface can say which situation it is actually in.
 */

export type SystemPosture =
  | "operational"
  | "degraded"
  | "awaiting-data"
  | "not-configured"
  | "unreachable";

export interface HealthPayload {
  status?: string;
  configuredProviders?: number;
  totalProviders?: number;
  runtime?: {
    accessMode?: string;
    databaseConfigured?: boolean;
    databaseReachable?: boolean;
    schemaReady?: boolean;
    adminConfigured?: boolean;
    capitalExecutionEnabled?: boolean;
    mode?: string;
    marketProviderConfigured?: boolean;
  };
  warehouse?: {
    liveSecurities?: number;
    validationSecurities?: number;
    liveOpportunities?: number;
    matured60mOutcomes?: number;
    marketSnapshots?: number;
    liveMarketSnapshots?: number;
    referenceMarketSnapshots?: number;
    quotedSecurities?: number;
  };
  marketPipeline?: { enabled: boolean; status: string; lastRunAt: string | null; error: string | null; cadenceMinutes?: number; overdue?: boolean } | null;
  databaseError?: string | null;
}

export interface Blocker {
  key: string;
  label: string;
  remedy: string;
}

export interface SystemState {
  posture: SystemPosture;
  /** Short uppercase label for the status rail. */
  label: string;
  /** One sentence an operator can act on. */
  detail: string;
  blockers: Blocker[];
  database: { configured: boolean; reachable: boolean; schemaReady: boolean };
  ingestion: {
    liveSecurities: number;
    liveOpportunities: number;
    maturedOutcomes: number;
    hasMarketData: boolean;
    marketSnapshots: number;
    liveMarketSnapshots: number;
    referenceMarketSnapshots: number;
    quotedSecurities: number;
  };
  providers: { configured: number; total: number };
  /** Invariant. Never derived from the payload, never true. */
  capitalExecutionEnabled: false;
}

const POSTURE_LABEL: Record<SystemPosture, string> = {
  operational: "OPERATIONAL",
  degraded: "DEGRADED",
  "awaiting-data": "AWAITING DATA",
  "not-configured": "NOT CONFIGURED",
  unreachable: "UNREACHABLE",
};

export function deriveSystemState(
  payload: HealthPayload | null | undefined,
): SystemState {
  const runtime = payload?.runtime ?? {};
  const warehouse = payload?.warehouse ?? {};

  const configured = Boolean(runtime.databaseConfigured);
  const reachable = Boolean(runtime.databaseReachable);
  const schemaReady = Boolean(runtime.schemaReady);
  const providersConfigured = Number(payload?.configuredProviders ?? 0);
  const providersTotal = Number(payload?.totalProviders ?? 0);

  const liveSecurities = Number(warehouse.liveSecurities ?? 0);
  const liveOpportunities = Number(warehouse.liveOpportunities ?? 0);
  const maturedOutcomes = Number(warehouse.matured60mOutcomes ?? 0);
  const marketSnapshots = Number(warehouse.marketSnapshots ?? 0);
  const liveMarketSnapshots = Number(warehouse.liveMarketSnapshots ?? 0);
  const referenceMarketSnapshots = Number(warehouse.referenceMarketSnapshots ?? 0);
  const quotedSecurities = Number(warehouse.quotedSecurities ?? 0);
  const hasMarketData = marketSnapshots > 0;
  const marketConfigured = runtime.marketProviderConfigured === true;
  const pipeline = payload?.marketPipeline;

  const blockers: Blocker[] = [];
  if (!configured) {
    blockers.push({
      key: "database_url",
      label: "Database not configured",
      remedy: "Set DATABASE_URL or POSTGRES_URL to the pooled Postgres connection string.",
    });
  } else if (!reachable) {
    blockers.push({
      key: "database_unreachable",
      label: "Database unreachable",
      remedy: payload?.databaseError
        ? `Connection failed: ${payload.databaseError}`
        : "The connection string is set but the database did not respond.",
    });
  } else if (!schemaReady) {
    blockers.push({
      key: "schema",
      label: "Schema not initialised",
      remedy: "Run the migrations, then bootstrap from the Admin Suite.",
    });
  }

  if (providersConfigured === 0) {
    blockers.push({
      key: "providers",
      label: "No data providers configured",
      remedy:
        "Configure at least one authoritative provider before any evidence can be collected.",
    });
  }

  if (configured && reachable && schemaReady && liveSecurities === 0) {
    blockers.push({
      key: "no_universe",
      label: "Securities universe is empty",
      remedy: "Seed the universe, then run one ingestion cycle.",
    });
  }

  if (configured && reachable && schemaReady && liveSecurities > 0) {
    if (!marketConfigured) blockers.push({key: 'live_market_provider', label: 'Live market feed unavailable', remedy: 'Enable a working live market provider in Admin. LLM credentials do not supply market quotes.'});
    if (!hasMarketData) blockers.push({key: 'no_quotes', label: 'No market quotes stored', remedy: 'The securities universe is ready. A successful market pull must store quotes before market research has price evidence.'});
    else if (!liveMarketSnapshots) blockers.push({key: 'no_live_quotes', label: 'No live quote evidence', remedy: 'Stored reference quotes support research context. Live opportunity scoring needs observations from a working live feed.'});
    if (!pipeline || !pipeline.lastRunAt) blockers.push({key: 'market_never_run', label: 'Market ingestion has no completed run', remedy: 'Run market ingestion from Operations and inspect the result.'});
    else if (!pipeline.enabled) blockers.push({key: 'market_disabled', label: 'Market ingestion is disabled', remedy: 'Enable Market Snapshots in Admin ingestion settings.'});
    else if (pipeline.status !== 'success') blockers.push({key: 'market_failed', label: 'Market ingestion needs attention', remedy: pipeline.error || `Latest market result: ${pipeline.status}. Inspect Operations for details.`});
    else if (pipeline.overdue) blockers.push({key: 'market_overdue', label: 'Market ingestion is overdue', remedy: 'The last completed run is older than the configured cadence allows. Inspect cron execution in Operations.'});
  }

  let posture: SystemPosture;
  let detail: string;

  if (!configured) {
    posture = "not-configured";
    detail =
      "Mercury is not connected to a warehouse. Nothing is being recorded.";
  } else if (!reachable) {
    posture = "unreachable";
    detail =
      "The warehouse is configured but not responding. No reads or writes are succeeding.";
  } else if (!schemaReady) {
    posture = "not-configured";
    detail =
      "The warehouse is reachable but its schema has not been initialised.";
  } else if (liveSecurities === 0) {
    posture = "awaiting-data";
    detail =
      providersConfigured === 0
        ? "Connected, but no provider is configured, so no market data can arrive."
        : "Connected with providers configured, but no securities have been ingested yet.";
  } else if (blockers.some(b => ['market_failed','market_disabled','market_overdue'].includes(b.key))) {
    posture = 'degraded';
    detail = hasMarketData ? 'Stored data is available for inspection. Market ingestion needs attention.' : 'Market ingestion needs attention. No market quotes are stored.';
  } else if (!hasMarketData) {
    posture = 'awaiting-data';
    detail = `Universe ready with ${liveSecurities} securities, but no market quotes have been stored.`;
  } else if (blockers.length > 0) {
    posture = "degraded";
    detail = referenceMarketSnapshots > 0 && liveMarketSnapshots === 0
      ? `${referenceMarketSnapshots} delayed reference quotes stored. Live opportunity scoring is awaiting a working live feed.`
      : 'Market evidence exists, but the latest health check reports runtime blockers.';
  } else {
    posture = "operational";
    detail = `${liveMarketSnapshots} live quote observations stored. Latest market ingestion succeeded.`;
  }

  return {
    posture,
    label: posture === 'degraded' && referenceMarketSnapshots > 0 && liveMarketSnapshots === 0 && pipeline?.enabled && pipeline.status === 'success' && !pipeline.overdue ? 'REFERENCE DATA' : POSTURE_LABEL[posture],
    detail,
    blockers,
    database: { configured, reachable, schemaReady },
    ingestion: {
      liveSecurities,
      liveOpportunities,
      maturedOutcomes,
      hasMarketData,
      marketSnapshots,
      liveMarketSnapshots,
      referenceMarketSnapshots,
      quotedSecurities,
    },
    providers: { configured: providersConfigured, total: providersTotal },
    capitalExecutionEnabled: false,
  };
}

/**
 * Which empty-state a data surface should show, given the system posture and
 * whether that surface actually returned rows. This is what stops "no data"
 * from meaning four different things.
 */
export type EmptyReason =
  | "not-configured"
  | "unreachable"
  | "awaiting-ingestion"
  | "awaiting-maturity"
  | "awaiting-input"
  | "no-match"
  | "none";

export function emptyReasonFor(
  state: SystemState | null,
  options: {
    rowCount: number;
    filtered?: boolean;
    requiresMaturity?: boolean;
  } = { rowCount: 0 },
): EmptyReason {
  if (options.rowCount > 0) return "none";
  if (!state) return "awaiting-ingestion";
  if (state.posture === "not-configured") return "not-configured";
  if (state.posture === "unreachable") return "unreachable";
  if (!state.ingestion.hasMarketData) return "awaiting-ingestion";
  if (options.requiresMaturity && state.ingestion.maturedOutcomes === 0)
    return "awaiting-maturity";
  if (options.filtered) return "no-match";
  return "awaiting-ingestion";
}
