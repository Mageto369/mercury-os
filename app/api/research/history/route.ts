import { NextResponse } from "next/server";
import {
  backfillHistoricalMarket,
  getHistoricalBackfillStatus,
} from "@/lib/research/historical-backfill";
import { computeSetupFingerprints } from "@/lib/research/setup-fingerprints";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getHistoricalBackfillStatus());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    startDate?: string;
    endDate?: string;
    provider?: "massive" | "intrinio" | "openbb" | "auto";
    computeFingerprints?: boolean;
  };
  const result = await backfillHistoricalMarket({
    startDate: body.startDate,
    endDate: body.endDate,
    provider: body.provider,
  });
  if (!result.ok)
    return NextResponse.json(result, {
      status: result.reason === "database_not_configured" ? 503 : 400,
    });
  const fingerprints =
    body.computeFingerprints === false
      ? null
      : await computeSetupFingerprints(1000);
  return NextResponse.json({ ...result, fingerprints });
}
