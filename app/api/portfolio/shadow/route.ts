import { NextResponse } from "next/server";
import {
  buildShadowPortfolio,
  getLatestShadowPortfolio,
} from "@/lib/portfolio/shadow-portfolio";

export const runtime = "nodejs";

export async function GET() {
  const result = await getLatestShadowPortfolio();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST() {
  const result = await buildShadowPortfolio();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
