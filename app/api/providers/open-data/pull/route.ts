import { NextResponse } from "next/server";
import { runOpenDataMesh } from "@/lib/providers/open-data/mesh";
export const runtime = "nodejs";
export async function POST() {
  const result = await runOpenDataMesh();
  return NextResponse.json(result, { status: result.ok ? 202 : 503 });
}
