import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();

  // Phase 1 stub. This endpoint will enqueue durable research workflows.
  const jobs = ["market-regime", "gem-discovery", "liquidity-pulse", "social-radar", "risk-gateway"];

  return NextResponse.json({ ok: true, startedAt, jobs, mode: "shadow" });
}
