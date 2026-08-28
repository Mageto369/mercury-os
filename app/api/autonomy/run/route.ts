import { NextResponse } from 'next/server';
import { z } from 'zod';
import { persistAutonomousResult } from '@/lib/autonomy/audit';
import { executeAutonomousJob } from '@/lib/autonomy/executor';
import { intelligenceJobs } from '@/lib/workflows/jobs';
import { requireBearerSecret } from '@/lib/security/request-auth';

export const runtime = 'nodejs';

const requestSchema = z.object({
  job: z.string().min(1),
});

export async function POST(request: Request) {
  const access = requireBearerSecret(request, process.env.CRON_SECRET);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.reason }, { status: access.status });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const job = intelligenceJobs.find((candidate) => candidate.name === parsed.data.job);
  if (!job) {
    return NextResponse.json({ ok: false, error: 'unknown_job' }, { status: 404 });
  }

  const result = await executeAutonomousJob(job);
  const audit = await persistAutonomousResult(result, 'manual');

  return NextResponse.json({
    ok: true,
    mode: 'shadow',
    capitalExecutionEnabled: false,
    result,
    audit,
  });
}
