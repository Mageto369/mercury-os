import { NextResponse } from "next/server";
import {
  getOutcomeEvidence,
  matureOpportunityOutcomes,
} from "@/lib/performance/outcomes";

export const runtime = "nodejs";

export async function GET() {
  const evidence = await getOutcomeEvidence();
  return NextResponse.json({ ok: true, ...evidence });
}

export async function POST() {
  const result = await matureOpportunityOutcomes();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
