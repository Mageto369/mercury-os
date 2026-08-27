import { NextResponse } from "next/server";
import { scoreOpportunity } from "@/lib/alpha/scoring";
import { sampleUniverse } from "@/lib/intelligence/sample-universe";

export const runtime = "nodejs";

export async function GET() {
  const opportunities = sampleUniverse
    .map((input) => ({ input, decision: scoreOpportunity(input) }))
    .sort((a, b) => b.decision.asymmetry - a.decision.asymmetry);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    mode: process.env.DATABASE_URL ? "database-ready" : "sample",
    opportunities,
  });
}
