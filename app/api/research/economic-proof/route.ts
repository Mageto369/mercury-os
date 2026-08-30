import { NextResponse } from "next/server";
import { evaluateEconomicProof } from "@/lib/intelligence/economic-proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await evaluateEconomicProof();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
