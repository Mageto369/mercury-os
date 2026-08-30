import { NextResponse } from "next/server";
import { jobsDueAt } from "@/lib/workflows/jobs";

export const runtime = "nodejs";

export async function POST() {
  const now = new Date();
  const jobs = jobsDueAt(now);

  return NextResponse.json({
    ok: true,
    mode: "shadow",
    executionEnabled: false,
    controlEffect: "schedule_preview_only",
    startedAt: now.toISOString(),
    jobs: jobs.map((job) => ({
      name: job.name,
      priority: job.priority,
      cadenceMinutes: job.cadenceMinutes,
      status: "due",
    })),
  });
}
