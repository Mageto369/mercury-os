import { NextResponse } from "next/server";
import {
  getOpenIntelligenceStatus,
  runOpenIntelligenceSync,
} from "@/lib/integrations/open-intelligence-sync";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getOpenIntelligenceStatus());
}

export async function POST() {
  const result = await runOpenIntelligenceSync();
  const status = result.ok
    ? 202
    : result.reason === "database_not_configured"
      ? 503
      : 424;
  return NextResponse.json(result, { status });
}
