import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const providers = {
    database: Boolean(process.env.DATABASE_URL),
    massive: Boolean(
      process.env.MASSIVE_API_KEY || process.env.MARKET_DATA_API_KEY,
    ),
    intrinio: Boolean(process.env.INTRINIO_API_KEY),
    sec: true,
    fred: Boolean(process.env.FRED_API_KEY),
    openIntelligence: Boolean(process.env.OPEN_INTELLIGENCE_URL),
    researchProof: Boolean(process.env.RESEARCH_PROOF_URL),
    otc: Boolean(process.env.OTC_MARKETS_API_KEY),
    reddit: Boolean(
      process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET,
    ),
    discord: Boolean(process.env.DISCORD_BOT_TOKEN),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    facebook: Boolean(process.env.FACEBOOK_ACCESS_TOKEN),
    ai: Boolean(process.env.OPENAI_API_KEY),
  };

  const configured = Object.values(providers).filter(Boolean).length;
  const sql = getSql();
  let databaseReachable = false;
  let schemaReady = false;
  let databaseError: string | null = null;
  let warehouse = {
    publicTables: 0,
    liveSecurities: 0,
    validationSecurities: 0,
    liveOpportunities: 0,
    matured60mOutcomes: 0,
  };

  if (sql) {
    try {
      const [tables, securities, opportunities, outcomes] = await Promise.all([
        sql<
          { count: number }[]
        >`select count(*)::int as count from information_schema.tables where table_schema = 'public'`,
        sql<{ live: number; validation: number }[]>`
          select
            count(*) filter (where id not like 'validation:%')::int as live,
            count(*) filter (where id like 'validation:%')::int as validation
          from securities
        `,
        sql<{ count: number }[]>`
          select count(*)::int as count
          from opportunities o
          join securities s on s.id = o.security_id
          where s.id not like 'validation:%'
        `,
        sql<{ count: number }[]>`
          select count(*)::int as count
          from opportunity_outcomes oo
          join securities s on s.id = oo.security_id
          where s.id not like 'validation:%' and oo.matured_60m = true
        `,
      ]);
      databaseReachable = true;
      warehouse = {
        publicTables: Number(tables[0]?.count ?? 0),
        liveSecurities: Number(securities[0]?.live ?? 0),
        validationSecurities: Number(securities[0]?.validation ?? 0),
        liveOpportunities: Number(opportunities[0]?.count ?? 0),
        matured60mOutcomes: Number(outcomes[0]?.count ?? 0),
      };
      schemaReady = warehouse.publicTables >= 48;
    } catch (error) {
      databaseError =
        error instanceof Error ? error.message : "database_health_check_failed";
    }
  }

  const runtimeReadiness = {
    accessMode: "personal-server-open" as const,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    databaseReachable,
    schemaReady,
    marketProviderConfigured: providers.massive || providers.intrinio,
    secConfigured: providers.sec,
    openIntelligenceConfigured: providers.openIntelligence,
    researchProofConfigured: providers.researchProof,
    capitalExecutionEnabled: false as const,
    mode: "shadow" as const,
  };

  const requiredRuntimeReady =
    runtimeReadiness.databaseReachable && runtimeReadiness.schemaReady;

  return NextResponse.json({
    status: databaseError ? "degraded" : "ok",
    service: "mercury-os",
    version: "0.4.0",
    configuredProviders: configured,
    totalProviders: Object.keys(providers).length,
    providers,
    runtime: runtimeReadiness,
    warehouse,
    requiredRuntimeReady,
    databaseError,
    checkedAt: new Date().toISOString(),
  });
}
