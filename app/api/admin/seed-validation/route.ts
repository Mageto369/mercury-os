import { NextResponse } from "next/server";
import { seedValidationUniverse } from "@/lib/db/seed-validation";

export const runtime = "nodejs";

export async function POST() {
  const result = await seedValidationUniverse();
  if (!result.ok) return NextResponse.json(result, { status: 503 });
  return NextResponse.json({
    ...result,
    mode: "shadow",
    capitalExecutionEnabled: false,
  });
}
