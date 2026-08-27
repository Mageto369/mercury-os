import { NextResponse } from "next/server";
import { persistAutonomousResult } from "@/lib/autonomy/audit";
import { executeAutonomousJobs } from "@/lib/autonomy/executor";
import { jobsDueAt } from "@/lib/workflows/jobs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const jobs = jobsDueAt(now);
  const results = await executeAutonomousJobs(jobs);
  const audits = await Promise.all(results.map((result) => persistAutonomousResult(result, "cron")));

  return NextResponse.json({
    ok: true,
    startedAt: now.toISOString(),
    completedAt: new Date().toISOString(),
    mode: "shadow",
    autonomousExecution: false,
    dueJobs: jobs.length,
    completed: results.filter((job) => job.status === "completed").length,
    degraded: results.filter((job) => job.status === "degraded").length,
    skipped: results.filter((job) => job.status === "skipped").length,
    persistedAudits: audits.filter((audit) => audit.persisted).length,
    jobs: results,
  });
}
