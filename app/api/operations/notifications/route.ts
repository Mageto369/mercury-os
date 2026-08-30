import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Schema = z.object({
  id: z.string().min(1).max(200),
  enabled: z.boolean(),
  minimumSeverity: z.enum(["info", "low", "medium", "high", "critical"]),
  channel: z
    .enum(["dashboard", "email", "slack", "webhook"])
    .default("dashboard"),
  destination: z.string().max(1000).nullable().optional(),
  cooldownMinutes: z.number().int().min(1).max(10080),
});
export async function PUT(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_notification_rule",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  const sql = getSql();
  if (!sql)
    return NextResponse.json(
      { ok: false, error: "database_not_configured" },
      { status: 503 },
    );
  try {
    const [rule] =
      await sql`update notification_rules set enabled=${parsed.data.enabled},minimum_severity=${parsed.data.minimumSeverity},channel=${parsed.data.channel},destination=${parsed.data.destination ?? null},cooldown_minutes=${parsed.data.cooldownMinutes},updated_at=now() where id=${parsed.data.id} returning id,rule_key,display_name,category,enabled,minimum_severity,channel,destination,cooldown_minutes,shadow_only,updated_at`;
    if (!rule)
      return NextResponse.json(
        { ok: false, error: "notification_rule_not_found" },
        { status: 404 },
      );
    return NextResponse.json({
      ok: true,
      rule,
      shadowOnly: true,
      capitalExecutionEnabled: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "notification_rule_update_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
        capitalExecutionEnabled: false,
      },
      { status: 500 },
    );
  }
}
