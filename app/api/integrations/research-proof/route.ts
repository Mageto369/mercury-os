import { NextResponse } from "next/server";
import {
  getResearchProofStatus,
  runResearchProofCycle,
} from "@/lib/integrations/research-proof";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getResearchProofStatus());
}

export async function POST() {
  const result = await runResearchProofCycle();
  const status = result.ok
    ? 202
    : result.reason === "database_not_configured"
      ? 503
      : result.reason === "research_proof_sidecar_not_configured"
        ? 424
        : 422;
  return NextResponse.json(result, { status });
}
