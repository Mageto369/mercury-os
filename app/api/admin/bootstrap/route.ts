import { NextResponse } from "next/server";
import { bootstrapDatabase } from "@/lib/db/bootstrap";
import { bootstrapIntelligenceLab } from "@/lib/db/bootstrap-intelligence-lab";

export const runtime = "nodejs";

export async function POST() {
  const core = await bootstrapDatabase();
  if (!core.ok) return NextResponse.json(core, { status: 503 });
  const intelligenceLab = await bootstrapIntelligenceLab();
  if (!intelligenceLab.ok)
    return NextResponse.json(intelligenceLab, { status: 503 });
  return NextResponse.json({
    ok: true,
    initializedAt: intelligenceLab.initializedAt,
    core,
    intelligenceLab,
    mode: "shadow",
    capitalExecutionEnabled: false,
  });
}
