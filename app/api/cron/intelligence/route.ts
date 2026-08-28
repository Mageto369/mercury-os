import { NextResponse } from 'next/server';
import { runSupervisor } from '@/lib/agents/supervisor';
import { matureOpportunityOutcomes } from '@/lib/performance/outcomes';
import { refreshSourceReputation } from '@/lib/research/source-reputation';
import { buildShadowPortfolio } from '@/lib/portfolio/shadow-portfolio';
import { pullAndPersistMarketData } from '@/lib/providers/market/router';
import { runOpenDataMesh } from '@/lib/providers/open-data/mesh';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let marketRefresh: Awaited<ReturnType<typeof pullAndPersistMarketData>> | { ok: false; reason: string };
  let openDataRefresh: Awaited<ReturnType<typeof runOpenDataMesh>> | { ok: false; reason: string };
  try { marketRefresh = await pullAndPersistMarketData(); }
  catch (error) { marketRefresh = { ok: false, reason: error instanceof Error ? error.message : 'market_refresh_failed' }; }
  try { openDataRefresh = await runOpenDataMesh(); }
  catch (error) { openDataRefresh = { ok: false, reason: error instanceof Error ? error.message : 'open_data_refresh_failed' }; }

  const result = await runSupervisor(new Date());
  let outcomeMaturation: Awaited<ReturnType<typeof matureOpportunityOutcomes>> | { ok: false; reason: string };
  let sourceReputation: Awaited<ReturnType<typeof refreshSourceReputation>> | { ok: false; reason: string };
  let shadowPortfolio: Awaited<ReturnType<typeof buildShadowPortfolio>> | { ok: false; reason: string };
  try { outcomeMaturation = await matureOpportunityOutcomes(250); }
  catch (error) { outcomeMaturation = { ok: false, reason: error instanceof Error ? error.message : 'outcome_maturation_failed' }; }
  try { sourceReputation = await refreshSourceReputation(); }
  catch (error) { sourceReputation = { ok: false, reason: error instanceof Error ? error.message : 'source_reputation_failed' }; }
  try { shadowPortfolio = await buildShadowPortfolio(); }
  catch (error) { shadowPortfolio = { ok: false, reason: error instanceof Error ? error.message : 'shadow_portfolio_failed' }; }

  return NextResponse.json({
    ok: true, mode: result.mode, autonomousExecution: false, capitalExecutionEnabled: false,
    supervisor: result.supervisor, startedAt: result.startedAt, completedAt: result.completedAt,
    dueJobs: result.dueJobs, completed: result.completed, degraded: result.degraded, skipped: result.skipped,
    persistedAudits: result.assignments.filter((assignment) => assignment.persisted).length,
    escalations: result.escalations, marketRefresh, openDataRefresh, outcomeMaturation, sourceReputation, shadowPortfolio,
    jobs: result.assignments,
  });
}
