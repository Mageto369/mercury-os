import { NextResponse } from "next/server";
import { pullAndPersistMarketData } from "@/lib/providers/market/router";

export const runtime = "nodejs";

export async function POST() {
  const result = await pullAndPersistMarketData();
  if (!result.ok)
    return NextResponse.json(result, {
      status: result.reason === "database_not_configured" ? 503 : 424,
    });
  return NextResponse.json(result, { status: 202 });
}
