import { NextResponse } from "next/server";
import { runShadowActivation } from "@/lib/activation/launch";

export const runtime = "nodejs";

export async function POST() {
  const result = await runShadowActivation();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
