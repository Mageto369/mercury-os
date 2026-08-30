import { NextResponse } from "next/server";
import {
  getSourceReputation,
  refreshSourceReputation,
} from "@/lib/research/source-reputation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await getSourceReputation(
    Number(url.searchParams.get("limit") ?? 50),
  );
  return NextResponse.json({ ok: true, ...result });
}

export async function POST() {
  const result = await refreshSourceReputation();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
