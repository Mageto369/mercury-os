import { NextResponse } from "next/server";
import {
  getDeepIntelligenceStatus,
  runDeepIntelligence,
} from "@/lib/intelligence/deep-intelligence";

export async function GET() {
  return NextResponse.json(await getDeepIntelligenceStatus());
}
export async function POST() {
  const result = await runDeepIntelligence();
  return NextResponse.json(result, { status: result.ok ? 202 : 503 });
}
