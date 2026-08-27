import type { IntelligenceJobDefinition } from '@/lib/workflows/jobs';
import { getProviderReadiness, type ProviderKey } from '@/lib/autonomy/providers';
import { evaluateAutonomyGuardrails } from '@/lib/risk/autonomy-guardrails';
import { runCorporateActionsWorkflow } from '@/lib/workflows/corporate-actions';
import { runGemDiscoveryWorkflow } from '@/lib/workflows/gem-discovery';
import { runLiquidityPulseWorkflow } from '@/lib/workflows/liquidity-pulse';
import { runMarketRegimeWorkflow } from '@/lib/workflows/market-regime';
import { runModelLearningWorkflow } from '@/lib/workflows/model-learning';
import { runRiskGatewayWorkflow } from '@/lib/workflows/risk-gateway';
import { runSecFilingsWorkflow } from '@/lib/workflows/sec-filings';
import { runShareStructureWorkflow } from '@/lib/workflows/share-structure';
import { runSocialRadarWorkflow } from '@/lib/workflows/social-radar';

export type AutonomousJobStatus = 'completed' | 'degraded' | 'skipped';

export interface AutonomousJobResult {
  name: IntelligenceJobDefinition['name'];
  status: AutonomousJobStatus;
  shadowOnly: true;
  startedAt: string;
  completedAt: string;
  requiredProviders: ProviderKey[];
  configuredProviders: ProviderKey[];
  missingProviders: ProviderKey[];
  actionCount: number;
  message: string;
}

const requirements: Record<IntelligenceJobDefinition['name'], ProviderKey[]> = {
  'liquidity-pulse': ['database'],
  'risk-gateway': ['database', 'marketData'],
  'social-radar': ['database'],
  'sec-filings': ['sec', 'database'],
  'market-regime': ['database'],
  'gem-discovery': ['database'],
  'share-structure': ['database'],
  'finra-actions': ['database'],
  'model-learning': ['database'],
};

function describe(job: IntelligenceJobDefinition, configured: ProviderKey[], missing: ProviderKey[]): Pick<AutonomousJobResult, 'status' | 'actionCount' | 'message'> {
  if (configured.length === 0) return { status: 'skipped', actionCount: 0, message: `Skipped safely because required providers are unavailable: ${missing.join(', ')}.` };
  if (missing.length > 0) return { status: 'degraded', actionCount: configured.length, message: `Ran readiness checks using ${configured.join(', ')}. Missing: ${missing.join(', ')}.` };
  return { status: 'completed', actionCount: configured.length, message: `Shadow workflow completed provider-readiness checks using ${configured.join(', ')}.` };
}

function failedJob(job: IntelligenceJobDefinition, startedAt: Date, requiredProviders: ProviderKey[], configuredProviders: ProviderKey[], missingProviders: ProviderKey[], label: string, error: unknown): AutonomousJobResult {
  return {
    name: job.name,
    status: 'degraded',
    shadowOnly: true,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    requiredProviders,
    configuredProviders,
    missingProviders,
    actionCount: 0,
    message: `${label} failed safely: ${error instanceof Error ? error.message : 'unknown workflow error'}.`,
  };
}

export async function executeAutonomousJob(job: IntelligenceJobDefinition): Promise<AutonomousJobResult> {
  const startedAt = new Date();
  const readiness = getProviderReadiness();
  const guardrails = evaluateAutonomyGuardrails();
  const requiredProviders = requirements[job.name];
  const configuredProviders = requiredProviders.filter((key) => readiness[key].configured);
  const missingProviders = requiredProviders.filter((key) => !readiness[key].configured);

  if (!guardrails.researchExecutionAllowed) {
    return {
      name: job.name,
      status: 'skipped',
      shadowOnly: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      requiredProviders,
      configuredProviders,
      missingProviders,
      actionCount: 0,
      message: `Skipped by autonomy guardrail: ${guardrails.reasons.join(', ')}.`,
    };
  }

  if (job.name === 'liquidity-pulse' && readiness.database.configured) {
    try {
      const result = await runLiquidityPulseWorkflow();
      return { name: job.name, status: result.snapshotsChecked ? 'completed' : 'degraded', shadowOnly: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), requiredProviders, configuredProviders, missingProviders, actionCount: result.signals.length, message: `Liquidity Pulse processed ${result.snapshotsChecked} snapshots and ranked ${result.signals.length} securities${result.snapshotsChecked ? '' : '; no recent market snapshots found'}.` };
    } catch (error) { return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Liquidity Pulse', error); }
  }

  if (job.name === 'market-regime' && readiness.database.configured) {
    try {
      const result = await runMarketRegimeWorkflow();
      return { name: job.name, status: result.snapshotsChecked ? 'completed' : 'degraded', shadowOnly: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), requiredProviders, configuredProviders, missingProviders, actionCount: result.symbolsObserved, message: `Market regime ${result.regime} with outlook ${result.outlookScore}, ${result.symbolsObserved} symbols, median RVOL ${result.medianRvol}, median spread ${result.medianSpreadBps} bps.` };
    } catch (error) { return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Market Regime', error); }
  }

  if (job.name === 'share-structure' && readiness.database.configured) {
    try {
      const result = await runShareStructureWorkflow();
      const material = result.changes.filter((change) => change.riskScore >= 48).length;
      return { name: job.name, status: result.observationsChecked ? 'completed' : 'degraded', shadowOnly: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), requiredProviders, configuredProviders, missingProviders, actionCount: material, message: `Share Structure compared ${result.securitiesCompared} securities, found ${material} material expansions, emitted ${result.eventsCreated} new warnings.` };
    } catch (error) { return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Share Structure', error); }
  }

  if (job.name === 'finra-actions' && readiness.database.configured) {
    try {
      const result = await runCorporateActionsWorkflow();
      return { name: job.name, status: result.actionsChecked ? 'completed' : 'degraded', shadowOnly: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), requiredProviders, configuredProviders, missingProviders, actionCount: result.highRisk.length, message: `Corporate Action agent reviewed ${result.actionsChecked} normalized actions and identified ${result.highRisk.length} high-risk events. External FINRA ingestion remains adapter-dependent.` };
    } catch (error) { return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Corporate Actions', error); }
  }

  if (job.name === 'risk-gateway' && readiness.database.configured) {
    try {
      const result = await runRiskGatewayWorkflow();
      return { name: job.name, status: readiness.marketData.configured ? 'completed' : 'degraded', shadowOnly: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), requiredProviders, configuredProviders, missingProviders, actionCount: result.flagged.length, message: `Structural risk scan flagged ${result.flagged.length} securities from ${result.corporateActionsChecked} high-risk corporate actions and ${result.dilutionEventsChecked} dilution events${readiness.marketData.configured ? '' : '; external market feed health unavailable'}.` };
    } catch (error) { return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Risk gateway', error); }
  }

  if (job.name === 'social-radar' && readiness.database.configured) {
    try {
      const result = await runSocialRadarWorkflow();
      return { name: job.name, status: result.signalsChecked ? 'completed' : 'degraded', shadowOnly: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), requiredProviders, configuredProviders, missingProviders, actionCount: result.trends.length, message: `Social Radar processed ${result.signalsChecked} authorized signals and ranked ${result.trends.length} ticker trends${result.signalsChecked ? '' : '; no recent authorized social data found'}.` };
    } catch (error) { return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Social Radar', error); }
  }

  if (job.name === 'gem-discovery' && readiness.database.configured) {
    try {
      const result = await runGemDiscoveryWorkflow();
      const strong = result.candidates.filter((candidate) => candidate.gemScore >= 75).length;
      return { name: job.name, status: result.universeSize ? 'completed' : 'degraded', shadowOnly: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), requiredProviders, configuredProviders, missingProviders, actionCount: strong, message: `Gem Discovery ranked ${result.candidates.length} candidates from ${result.universeSize} liquid symbols, with ${strong} scoring 75 or higher under market outlook ${result.marketOutlook}.` };
    } catch (error) { return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Gem Discovery', error); }
  }

  if (job.name === 'model-learning' && readiness.database.configured) {
    try {
      const result = await runModelLearningWorkflow();
      return { name: job.name, status: result.opportunitiesReviewed ? 'completed' : 'degraded', shadowOnly: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), requiredProviders, configuredProviders, missingProviders, actionCount: result.metrics.length, message: `Replay reviewed ${result.opportunitiesReviewed} opportunities and ${result.decisionsReviewed} decisions. Drift ${result.driftDetected ? 'detected and escalated' : 'not detected'}.` };
    } catch (error) { return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Model Learning', error); }
  }

  if (missingProviders.length === 0 && job.name === 'sec-filings') {
    try {
      const result = await runSecFilingsWorkflow();
      return { name: job.name, status: result.errors.length ? 'degraded' : 'completed', shadowOnly: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), requiredProviders, configuredProviders, missingProviders, actionCount: result.filingsInserted, message: `SEC ingestion checked ${result.companiesChecked} companies, observed ${result.filingsObserved} material filings, inserted ${result.filingsInserted}, emitted ${result.signalsCreated} machine signals${result.errors.length ? `, with ${result.errors.length} errors` : ''}.` };
    } catch (error) { return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'SEC ingestion', error); }
  }

  const outcome = describe(job, configuredProviders, missingProviders);
  return { name: job.name, shadowOnly: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), requiredProviders, configuredProviders, missingProviders, ...outcome };
}

export async function executeAutonomousJobs(jobs: IntelligenceJobDefinition[]) {
  return Promise.all(jobs.map(executeAutonomousJob));
}
