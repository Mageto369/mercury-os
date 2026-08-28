import { NextResponse } from 'next/server';
import { jobsDueAt } from '@/lib/workflows/jobs';

export const runtime = 'nodejs';

function sameOrigin(request: Request) {
  if (process.env.NODE_ENV !== 'production') return true;
  const origin = request.headers.get('origin');
  // Non-browser/internal clients commonly omit Origin. The pulse is a read-only
  // schedule preview, so only reject requests that explicitly present a foreign origin.
  if (!origin) return true;
  const host = request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden_origin' }, { status: 403 });
  }

  const now = new Date();
  const jobs = jobsDueAt(now);

  return NextResponse.json({
    ok: true,
    mode: 'shadow',
    executionEnabled: false,
    controlEffect: 'schedule_preview_only',
    startedAt: now.toISOString(),
    jobs: jobs.map(job => ({
      name: job.name,
      priority: job.priority,
      cadenceMinutes: job.cadenceMinutes,
      status: 'due',
    })),
  });
}
