import { NextResponse } from 'next/server';
import { runSupervisor } from '@/lib/agents/supervisor';
import { matureOpportunityOutcomes } from '@/lib/performance/outcomes';
import { refreshSourceReputation } from '@/lib/research/source-reputation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const result = await runSupervisor(new Date());
  let outcomeMaturation: Awaited<ReturnType<typeof matureOpportunityOutcomes>> | { ok: false; reason: string };
  let sourceReputation: Awaited<ReturnType<typeof refreshSourceReputation>> | { ok: false; reason: string };
  try {
    outcomeMaturation = await matureOpportunityOutcomes(250);
  } catch (error) {
    outcomeMaturation = { ok: false, reason: error instanceof Error ? error.message : 'outcome_maturation_failed' };
  }
  try {
    sourceReputation = await refreshSourceReputation();
  } catch (error) {
    sourceReputation = { ok: false, reason: error instanceof Error ? error.message : 'source_reputation_failed' };
  }

  return NextResponse.json({
    ok: true,
    mode: result.mode,
    autonomousExecution: false,
    capitalExecutionEnabled: false,
    supervisor: result.supervisor,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    dueJobs: result.dueJobs,
    completed: result.completed,
    degraded: result.degraded,
    skipped: result.skipped,
    persistedAudits: result.assignments.filter((assignment) => assignment.persisted).length,
    escalations: result.escalations,
    outcomeMaturation,
    sourceReputation,
    jobs: result.assignments,
  });
}
