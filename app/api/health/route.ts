import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getDatabaseConfig } from "@/lib/db/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const databaseConfig = getDatabaseConfig();
  const providers = {
    database: Boolean(databaseConfig.url),
    massive: Boolean(
      process.env.MASSIVE_API_KEY || process.env.MARKET_DATA_API_KEY,
    ),
    intrinio: Boolean(process.env.INTRINIO_API_KEY),
    nasdaqDelayed: process.env.NASDAQ_DELAYED_ENABLED !== "0",
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
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    kimi: Boolean(process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY),
  };

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
      const integrationRows = await sql<
        { id: string; enabled: boolean; model: string | null; secret_configured: boolean }[]
      >`select c.id,c.enabled,c.model,exists(select 1 from integration_secrets s where s.integration_id=c.id and s.secret_name='api_key') as secret_configured from integration_configs c where c.id in ('massive','intrinio','openai','anthropic','gemini','deepseek','kimi')`;
      for (const row of integrationRows) {
        if (row.id === "massive")
          providers.massive = Boolean(row.enabled && (row.secret_configured || providers.massive));
        if (row.id === "intrinio")
          providers.intrinio = Boolean(row.enabled && (row.secret_configured || providers.intrinio));
        if (row.id === "openai")
          providers.openai = Boolean(
            row.enabled && row.model && (row.secret_configured || providers.openai),
          );
        if (row.id === "anthropic")
          providers.anthropic = Boolean(
            row.enabled && row.model && (row.secret_configured || providers.anthropic),
          );
        if (row.id === "gemini")
          providers.gemini = Boolean(
            row.enabled && row.model && (row.secret_configured || providers.gemini),
          );
        if (row.id === "deepseek")
          providers.deepseek = Boolean(
            row.enabled && row.model && (row.secret_configured || providers.deepseek),
          );
        if (row.id === "kimi")
          providers.kimi = Boolean(
            row.enabled && row.model && (row.secret_configured || providers.kimi),
          );
      }
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
    databaseConfigured: Boolean(databaseConfig.url),
    databaseSource: databaseConfig.source,
    databaseReachable,
    schemaReady,
    marketProviderConfigured: providers.massive || providers.intrinio,
    marketReferenceProviderConfigured: providers.nasdaqDelayed,
    secConfigured: providers.sec,
    openIntelligenceConfigured: providers.openIntelligence,
    researchProofConfigured: providers.researchProof,
    capitalExecutionEnabled: false as const,
    mode: "shadow" as const,
  };

  const requiredRuntimeReady =
    runtimeReadiness.databaseReachable && runtimeReadiness.schemaReady;
  const configured = Object.values(providers).filter(Boolean).length;

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
