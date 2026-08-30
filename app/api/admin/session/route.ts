import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: true,
    authenticated: true,
    accessMode: "personal-server-open",
  });
}

export async function POST() {
  return NextResponse.json({
    ok: true,
    authenticated: true,
    accessMode: "personal-server-open",
  });
}

export async function DELETE() {
  return NextResponse.json({
    ok: true,
    authenticated: true,
    accessMode: "personal-server-open",
  });
}
