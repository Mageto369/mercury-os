import { expect, test } from "@playwright/test";
import {
  deriveSystemState,
  emptyReasonFor,
  type HealthPayload,
} from "../../lib/system/health-state";

const health = (overrides: Partial<HealthPayload> = {}): HealthPayload => ({
  configuredProviders: 3,
  totalProviders: 13,
  ...overrides,
  // Merged after the spread so a partial runtime/warehouse override keeps the
  // remaining defaults instead of replacing the whole object.
  runtime: {
    accessMode: "personal-server-open",
    databaseConfigured: true,
    databaseReachable: true,
    schemaReady: true,
    marketProviderConfigured: true,
    ...overrides.runtime,
  },
  warehouse: {
    liveSecurities: 120,
    liveOpportunities: 40,
    matured60mOutcomes: 25,
    marketSnapshots: 250,
    liveMarketSnapshots: 250,
    referenceMarketSnapshots: 0,
    quotedSecurities: 120,
    ...overrides.warehouse,
  },
  marketPipeline: overrides.marketPipeline === undefined ? {enabled: true, status: 'success', lastRunAt: '2026-09-05T06:00:00Z', error: null, overdue: false} : overrides.marketPipeline,
});

test.describe("posture", () => {
  test('a seeded universe with no quote evidence is awaiting data', () => {
    const state = deriveSystemState(health({warehouse:{marketSnapshots:0, liveMarketSnapshots:0, quotedSecurities:0}}));
    expect(state.posture).toBe('awaiting-data');
    expect(state.ingestion.hasMarketData).toBe(false);
    expect(state.blockers.map(b=>b.key)).toContain('no_quotes');
  });

  test('working reference ingestion never claims live-market operation', () => {
    const state = deriveSystemState(health({runtime:{marketProviderConfigured:false},warehouse:{marketSnapshots:129,liveMarketSnapshots:0,referenceMarketSnapshots:129,quotedSecurities:129}}));
    expect(state.label).toBe('REFERENCE DATA');
    expect(state.detail).toContain('129 delayed reference quotes');
    expect(state.blockers.map(b=>b.key)).toContain('live_market_provider');
  });

  test('a failed pipeline overrides configured providers and existing quotes', () => {
    const state = deriveSystemState(health({marketPipeline:{enabled:true,status:'degraded',lastRunAt:'2026-09-05T06:00:00Z',error:'persistence_failed'}}));
    expect(state.posture).toBe('degraded');
    expect(state.blockers.find(b=>b.key==='market_failed')?.remedy).toBe('persistence_failed');
  });

  test('old success is not current operating evidence', () => {
    const state = deriveSystemState(health({marketPipeline:{enabled:true,status:'success',lastRunAt:'2026-09-01T00:00:00Z',error:null,overdue:true}}));
    expect(state.posture).toBe('degraded');
    expect(state.blockers.map(b=>b.key)).toContain('market_overdue');
  });

  test('missing ingestion history never qualifies as operational', () => {
    const state = deriveSystemState(health({marketPipeline:null}));
    expect(state.posture).toBe('degraded');
    expect(state.blockers.map(b=>b.key)).toContain('market_never_run');
  });

  test('disabled ingestion is actionable even with a previous success', () => {
    const state = deriveSystemState(health({marketPipeline:{enabled:false,status:'success',lastRunAt:'2026-09-05T06:00:00Z',error:null}}));
    expect(state.blockers.map(b=>b.key)).toContain('market_disabled');
    expect(state.posture).toBe('degraded');
  });

  test("a fully configured, ingesting system is operational", () => {
    const state = deriveSystemState(health());
    expect(state.posture).toBe("operational");
    expect(state.label).toBe("OPERATIONAL");
    expect(state.blockers).toEqual([]);
  });

  test("an unconfigured database is reported as configuration, not as empty data", () => {
    const state = deriveSystemState(
      health({ runtime: { databaseConfigured: false } }),
    );
    expect(state.posture).toBe("not-configured");
    expect(state.detail).toContain("not connected");
    expect(state.blockers.map((b) => b.key)).toContain("database_url");
  });

  test("a configured but unresponsive database is unreachable, not unconfigured", () => {
    const state = deriveSystemState(
      health({
        runtime: { databaseConfigured: true, databaseReachable: false },
      }),
    );
    expect(state.posture).toBe("unreachable");
    expect(state.blockers.map((b) => b.key)).toContain("database_unreachable");
  });

  test("a reachable database with no schema is a configuration gap", () => {
    const state = deriveSystemState(
      health({ runtime: { schemaReady: false } }),
    );
    expect(state.posture).toBe("not-configured");
    expect(state.blockers.map((b) => b.key)).toContain("schema");
  });

  test("connected with an empty universe is awaiting data, not healthy", () => {
    const state = deriveSystemState(
      health({ warehouse: { liveSecurities: 0 } }),
    );
    expect(state.posture).toBe("awaiting-data");
    expect(state.blockers.map((b) => b.key)).toContain("no_universe");
  });

  test("personal-server access does not create a runtime blocker", () => {
    const state = deriveSystemState(
      health({ runtime: { accessMode: "personal-server-open" } }),
    );
    expect(state.blockers.map((b) => b.key)).not.toContain("cron_secret");
  });

  test("zero configured providers is called out even when the database is fine", () => {
    const state = deriveSystemState(health({ configuredProviders: 0 }));
    expect(state.blockers.map((b) => b.key)).toContain("providers");
  });

  test("a failed health probe reports unreachable rather than pretending to be fine", () => {
    const state = deriveSystemState(null);
    expect(state.posture).toBe("not-configured");
    expect(state.database.reachable).toBe(false);
  });

  test("capital execution is never derived from the payload", () => {
    const state = deriveSystemState({
      ...health(),
      runtime: { ...health().runtime, capitalExecutionEnabled: true },
    });
    expect(state.capitalExecutionEnabled).toBe(false);
  });
});

test.describe("empty reason", () => {
  const operational = deriveSystemState(health());
  const unconfigured = deriveSystemState(
    health({ runtime: { databaseConfigured: false } }),
  );
  const empty = deriveSystemState(health({ warehouse: { liveSecurities: 0 } }));

  test("rows present means no empty state at all", () => {
    expect(emptyReasonFor(operational, { rowCount: 3 })).toBe("none");
  });

  test('an unconfigured system says so instead of "no data"', () => {
    expect(emptyReasonFor(unconfigured, { rowCount: 0 })).toBe(
      "not-configured",
    );
  });

  test("an empty warehouse is awaiting ingestion", () => {
    expect(emptyReasonFor(empty, { rowCount: 0 })).toBe("awaiting-ingestion");
  });

  test("a filtered view with data behind it says no match", () => {
    expect(emptyReasonFor(operational, { rowCount: 0, filtered: true })).toBe(
      "no-match",
    );
  });

  test("surfaces needing matured outcomes distinguish maturity from ingestion", () => {
    const noOutcomes = deriveSystemState(
      health({ warehouse: { liveSecurities: 50, matured60mOutcomes: 0 } }),
    );
    expect(
      emptyReasonFor(noOutcomes, { rowCount: 0, requiresMaturity: true }),
    ).toBe("awaiting-maturity");
  });

  test("an unknown system state degrades to awaiting ingestion", () => {
    expect(emptyReasonFor(null, { rowCount: 0 })).toBe("awaiting-ingestion");
  });
});
