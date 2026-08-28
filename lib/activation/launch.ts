import { bootstrapDatabase } from '@/lib/db/bootstrap';
import { bootstrapIntelligenceLab } from '@/lib/db/bootstrap-intelligence-lab';
import { bootstrapHistoricalReplay } from '@/lib/db/bootstrap-history';
import { bootstrapOpenDataMesh } from '@/lib/db/bootstrap-open-data';
import { bootstrapOpenSourceIntelligence } from '@/lib/db/bootstrap-open-source';
import { seedValidationUniverse } from '@/lib/db/seed-validation';
import { runSupervisor } from '@/lib/agents/supervisor';
import { getProductionReadiness } from '@/lib/activation/readiness';
import { getShadowPerformance } from '@/lib/performance/shadow';
import { matureOpportunityOutcomes } from '@/lib/performance/outcomes';
import { getLatestAgentHeartbeats } from '@/lib/agents/heartbeat';
import { ensureBaselineModel } from '@/lib/models/governance';

const activationJobs = ['market-regime','liquidity-pulse','social-radar','sec-filings','finra-actions','share-structure','risk-gateway','gem-discovery','model-learning'] as const;

export async function runShadowActivation() {
  const startedAt = new Date();
  const bootstrap = await bootstrapDatabase();
  if (!bootstrap.ok) return { ok:false as const, phase:'bootstrap' as const, bootstrap, mode:'shadow' as const, capitalExecutionEnabled:false as const, startedAt:startedAt.toISOString(), finishedAt:new Date().toISOString() };
  const intelligenceLab = await bootstrapIntelligenceLab();
  if (!intelligenceLab.ok) return { ok:false as const, phase:'intelligence-lab-bootstrap' as const, bootstrap, intelligenceLab, mode:'shadow' as const, capitalExecutionEnabled:false as const, startedAt:startedAt.toISOString(), finishedAt:new Date().toISOString() };
  const historicalReplay = await bootstrapHistoricalReplay();
  if (!historicalReplay.ok) return { ok:false as const, phase:'historical-replay-bootstrap' as const, bootstrap, intelligenceLab, historicalReplay, mode:'shadow' as const, capitalExecutionEnabled:false as const, startedAt:startedAt.toISOString(), finishedAt:new Date().toISOString() };
  const openDataMesh = await bootstrapOpenDataMesh();
  if (!openDataMesh.ok) return { ok:false as const, phase:'open-data-bootstrap' as const, bootstrap, intelligenceLab, historicalReplay, openDataMesh, mode:'shadow' as const, capitalExecutionEnabled:false as const, startedAt:startedAt.toISOString(), finishedAt:new Date().toISOString() };
  const openSourceIntelligence = await bootstrapOpenSourceIntelligence();
  if (!openSourceIntelligence.ok) return { ok:false as const, phase:'open-source-intelligence-bootstrap' as const, bootstrap, intelligenceLab, historicalReplay, openDataMesh, openSourceIntelligence, mode:'shadow' as const, capitalExecutionEnabled:false as const, startedAt:startedAt.toISOString(), finishedAt:new Date().toISOString() };

  const modelBaseline = await ensureBaselineModel();
  const seed = await seedValidationUniverse();
  if (!seed.ok) return { ok:false as const, phase:'seed-validation' as const, bootstrap, intelligenceLab, historicalReplay, openDataMesh, openSourceIntelligence, modelBaseline, seed, mode:'shadow' as const, capitalExecutionEnabled:false as const, startedAt:startedAt.toISOString(), finishedAt:new Date().toISOString() };

  const supervisor = await runSupervisor(new Date(), [...activationJobs], 'manual');
  const outcomeMaturation = await matureOpportunityOutcomes(500);
  const [readiness, performance, fleet] = await Promise.all([getProductionReadiness(), getShadowPerformance(), getLatestAgentHeartbeats()]);
  const degraded = supervisor.degraded > 0 || supervisor.skipped > 0;
  return { ok:true as const, phase:degraded ? 'shadow-activated-degraded' as const : 'shadow-activated' as const, mode:'shadow' as const, capitalExecutionEnabled:false as const, bootstrap, intelligenceLab, historicalReplay, openDataMesh, openSourceIntelligence, modelBaseline, seed, outcomeMaturation, supervisor:{supervisor:supervisor.supervisor,dueJobs:supervisor.dueJobs,completed:supervisor.completed,degraded:supervisor.degraded,skipped:supervisor.skipped,assignments:supervisor.assignments}, readiness, performance, fleet:{persistent:fleet.persistent,observedAgents:fleet.heartbeats.length}, startedAt:startedAt.toISOString(), finishedAt:new Date().toISOString() };
}
