import type { IntelligenceJobDefinition } from '@/lib/workflows/jobs';
import { getProviderReadiness, type ProviderKey } from '@/lib/autonomy/providers';
import { evaluateAutonomyGuardrails } from '@/lib/risk/autonomy-guardrails';
import { runLiquidityPulseWorkflow } from '@/lib/workflows/liquidity-pulse';
import { runMarketRegimeWorkflow } from '@/lib/workflows/market-regime';
import { runRiskGatewayWorkflow } from '@/lib/workflows/risk-gateway';
import { runSecFilingsWorkflow } from '@/lib/workflows/sec-filings';
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
  'gem-discovery': ['marketData', 'sec', 'otc', 'database'],
  'share-structure': ['otc', 'database'],
  'finra-actions': [],
  'model-learning': ['database'],
};

function describe(job: IntelligenceJobDefinition, configured: ProviderKey[], missing: ProviderKey[]): Pick<AutonomousJobResult, 'status' | 'actionCount' | 'message'> {
  if (job.name === 'finra-actions') {
    return {
      status: 'degraded',
      actionCount: 0,
      message: 'FINRA adapter contract is reserved, but no authenticated provider is configured yet.',
    };
  }

  if (configured.length === 0) {
    return {
      status: 'skipped',
      actionCount: 0,
      message: `Skipped safely because required providers are unavailable: ${missing.join(', ')}.`,
    };
  }

  if (missing.length > 0) {
    return {
      status: 'degraded',
      actionCount: configured.length,
      message: `Ran readiness checks using ${configured.join(', ')}. Missing: ${missing.join(', ')}.`,
    };
  }

  return {
    status: 'completed',
    actionCount: configured.length,
    message: `Shadow workflow completed provider-readiness checks using ${configured.join(', ')}.`,
  };
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
      const liquidity = await runLiquidityPulseWorkflow();
      return {
        name: job.name,
        status: liquidity.snapshotsChecked > 0 ? 'completed' : 'degraded',
        shadowOnly: true,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        requiredProviders,
        configuredProviders,
        missingProviders,
        actionCount: liquidity.signals.length,
        message: `Liquidity Pulse processed ${liquidity.snapshotsChecked} snapshots and ranked ${liquidity.signals.length} securities${liquidity.snapshotsChecked ? '' : '; no recent market snapshots found'}.`,
      };
    } catch (error) {
      return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Liquidity Pulse', error);
    }
  }

  if (job.name === 'market-regime' && readiness.database.configured) {
    try {
      const regime = await runMarketRegimeWorkflow();
      return {
        name: job.name,
        status: regime.snapshotsChecked > 0 ? 'completed' : 'degraded',
        shadowOnly: true,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        requiredProviders,
        configuredProviders,
        missingProviders,
        actionCount: regime.symbolsObserved,
        message: `Market regime ${regime.regime} with outlook ${regime.outlookScore}, ${regime.symbolsObserved} symbols, median RVOL ${regime.medianRvol}, median spread ${regime.medianSpreadBps} bps.`,
      };
    } catch (error) {
      return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Market Regime', error);
    }
  }

  if (job.name === 'risk-gateway' && readiness.database.configured) {
    try {
      const risk = await runRiskGatewayWorkflow();
      return {
        name: job.name,
        status: readiness.marketData.configured ? 'completed' : 'degraded',
        shadowOnly: true,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        requiredProviders,
        configuredProviders,
        missingProviders,
        actionCount: risk.flagged.length,
        message: `Structural risk scan flagged ${risk.flagged.length} securities from ${risk.corporateActionsChecked} high-risk corporate actions and ${risk.dilutionEventsChecked} dilution events${readiness.marketData.configured ? '' : '; external market feed health unavailable'}.`,
      };
    } catch (error) {
      return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Risk gateway', error);
    }
  }

  if (job.name === 'social-radar' && readiness.database.configured) {
    try {
      const social = await runSocialRadarWorkflow();
      return {
        name: job.name,
        status: social.signalsChecked > 0 ? 'completed' : 'degraded',
        shadowOnly: true,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        requiredProviders,
        configuredProviders,
        missingProviders,
        actionCount: social.trends.length,
        message: `Social Radar processed ${social.signalsChecked} authorized signals and ranked ${social.trends.length} ticker trends${social.signalsChecked ? '' : '; no recent authorized social data found'}.`,
      };
    } catch (error) {
      return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'Social Radar', error);
    }
  }

  if (missingProviders.length === 0 && job.name === 'sec-filings') {
    try {
      const sec = await runSecFilingsWorkflow();
      return {
        name: job.name,
        status: sec.errors.length ? 'degraded' : 'completed',
        shadowOnly: true,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        requiredProviders,
        configuredProviders,
        missingProviders,
        actionCount: sec.filingsInserted,
        message: `SEC ingestion checked ${sec.companiesChecked} companies, observed ${sec.filingsObserved} material filings, inserted ${sec.filingsInserted}, emitted ${sec.signalsCreated} machine signals${sec.errors.length ? `, with ${sec.errors.length} errors` : ''}.`,
      };
    } catch (error) {
      return failedJob(job, startedAt, requiredProviders, configuredProviders, missingProviders, 'SEC ingestion', error);
    }
  }

  const outcome = describe(job, configuredProviders, missingProviders);

  return {
    name: job.name,
    shadowOnly: true,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    requiredProviders,
    configuredProviders,
    missingProviders,
    ...outcome,
  };
}

export async function executeAutonomousJobs(jobs: IntelligenceJobDefinition[]) {
  return Promise.all(jobs.map(executeAutonomousJob));
}
