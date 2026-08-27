import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const providers = {
    database: Boolean(process.env.DATABASE_URL),
    marketData: Boolean(process.env.MARKET_DATA_API_KEY),
    sec: Boolean(process.env.SEC_USER_AGENT),
    otc: Boolean(process.env.OTC_MARKETS_API_KEY),
    reddit: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
    discord: Boolean(process.env.DISCORD_BOT_TOKEN),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    facebook: Boolean(process.env.FACEBOOK_ACCESS_TOKEN),
    ai: Boolean(process.env.OPENAI_API_KEY),
  };

  const configured = Object.values(providers).filter(Boolean).length;

  return NextResponse.json({
    status: "ok",
    service: "mercury-os",
    version: "0.2.0",
    configuredProviders: configured,
    totalProviders: Object.keys(providers).length,
    providers,
    checkedAt: new Date().toISOString(),
  });
}
