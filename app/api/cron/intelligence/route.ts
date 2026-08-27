import { NextResponse } from "next/server";
import { jobsForCronPulse } from "@/lib/workflows/jobs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const jobs = jobsForCronPulse();

  return NextResponse.json({
    ok: true,
    startedAt,
    mode: "shadow",
    autonomousExecution: false,
    jobs: jobs.map((job) => ({
      name: job.name,
      cadence: job.cadence,
      priority: job.priority,
      shadowOnly: job.shadowOnly,
      description: job.description,
      status: "queued-for-provider-wiring",
    })),
  });
}
