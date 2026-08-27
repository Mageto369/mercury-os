import { NextResponse } from 'next/server';
import { runSupervisor } from '@/lib/agents/supervisor';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const result = await runSupervisor(new Date());

  return NextResponse.json({
    ok: true,
    mode: result.mode,
    autonomousExecution: false,
    supervisor: result.supervisor,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    dueJobs: result.dueJobs,
    completed: result.completed,
    degraded: result.degraded,
    skipped: result.skipped,
    persistedAudits: result.assignments.filter((assignment) => assignment.persisted).length,
    escalations: result.escalations,
    jobs: result.assignments,
  });
}
