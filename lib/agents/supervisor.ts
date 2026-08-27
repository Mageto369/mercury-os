import { runDataQualityAgent, type DataQualityResult } from '@/lib/agents/data-quality';
import { runGovernanceAgent, type GovernanceResult } from '@/lib/agents/governance';
import { agentForJob, agentsById, type AgentId } from '@/lib/agents/registry';
import { persistAutonomousResult } from '@/lib/autonomy/audit';
import { executeAutonomousJob, type AutonomousJobResult } from '@/lib/autonomy/executor';
import { getProviderReadiness } from '@/lib/autonomy/providers';
import { evaluateAutonomyGuardrails } from '@/lib/risk/autonomy-guardrails';
import { intelligenceJobs, jobsDueAt, type IntelligenceJobDefinition, type IntelligenceJobName } from '@/lib/workflows/jobs';
import { runOpportunityEngineWorkflow } from '@/lib/workflows/opportunity-engine';

export interface AgentAssignmentResult {
  agentId: AgentId;
  agentName: string;
  job: IntelligenceJobName | 'opportunity-director';
  status: 'completed' | 'degraded' | 'skipped';
  actionCount: number;
  message: string;
  persisted: boolean;
}

export interface SupervisorRunResult {
  supervisor: 'mercury-supervisor';
  mode: 'shadow';
  capitalExecutionEnabled: false;
  startedAt: string;
  completedAt: string;
  dueJobs: number;
  assignments: AgentAssignmentResult[];
  completed: number;
  degraded: number;
  skipped: number;
  escalations: string[];
  controls: {
    governance: GovernanceResult;
    dataQuality: DataQualityResult;
  };
}

const phaseOrder: IntelligenceJobName[] = [
  'liquidity-pulse', 'social-radar', 'sec-filings', 'share-structure', 'finra-actions',
  'risk-gateway', 'market-regime', 'gem-discovery', 'model-learning',
];

function sortJobs(jobs: IntelligenceJobDefinition[]) {
  const order = new Map(phaseOrder.map((name, index) => [name, index]));
  return [...jobs].sort((a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999));
}

function assignmentFromResult(result: AutonomousJobResult, persisted: boolean): AgentAssignmentResult {
  const agent = agentForJob(result.name);
  return {
    agentId: agent?.id ?? 'mercury-supervisor',
    agentName: agent?.name ?? 'Mercury Supervisor',
    job: result.name,
    status: result.status,
    actionCount: result.actionCount,
    message: result.message,
    persisted,
  };
}

async function runOpportunityDirector(): Promise<AgentAssignmentResult> {
  const agent = agentsById['opportunity-director-agent'];
  try {
    const result = await runOpportunityEngineWorkflow();
    return {
      agentId: agent.id,
      agentName: agent.name,
      job: 'opportunity-director',
      status: result.generated.length ? 'completed' : 'degraded',
      actionCount: result.generated.length,
      message: `Vector evaluated ${result.candidatesChecked} candidates, persisted ${result.generated.length} shadow opportunities, and hard-blocked ${result.blocked}.`,
      persisted: Boolean(process.env.DATABASE_URL),
    };
  } catch (error) {
    return {
      agentId: agent.id,
      agentName: agent.name,
      job: 'opportunity-director',
      status: 'degraded',
      actionCount: 0,
      message: `Vector failed safely: ${error instanceof Error ? error.message : 'unknown opportunity workflow error'}.`,
      persisted: false,
    };
  }
}

export async function runSupervisor(
  date = new Date(),
  requestedJobs?: IntelligenceJobName[],
  trigger: 'cron' | 'manual' = 'cron',
): Promise<SupervisorRunResult> {
  const startedAt = new Date();
  const readiness = getProviderReadiness();
  const guardrails = evaluateAutonomyGuardrails();
  const governance = runGovernanceAgent();
  const dataQuality = await runDataQualityAgent();
  const selected = requestedJobs?.length
    ? intelligenceJobs.filter((job) => requestedJobs.includes(job.name))
    : jobsDueAt(date);
  const assignments: AgentAssignmentResult[] = [];
  const escalations: string[] = [];

  if (governance.status === 'degraded') escalations.push(`governance: ${governance.authorityViolations.join(', ')}`);
  if (dataQuality.status !== 'healthy') escalations.push(`data-quality: ${dataQuality.staleDomains.join(', ')}`);

  const supervisorHalted = !guardrails.researchExecutionAllowed || governance.status === 'degraded';
  if (supervisorHalted) {
    const reasons = [...guardrails.reasons, ...governance.authorityViolations];
    for (const job of sortJobs(selected)) {
      const agent = agentForJob(job.name);
      assignments.push({
        agentId: agent?.id ?? 'mercury-supervisor',
        agentName: agent?.name ?? 'Mercury Supervisor',
        job: job.name,
        status: 'skipped',
        actionCount: 0,
        message: `Supervisor halt: ${reasons.join(', ')}.`,
        persisted: false,
      });
    }
  } else {
    for (const job of sortJobs(selected)) {
      const result = await executeAutonomousJob(job);
      const audit = await persistAutonomousResult(result, trigger);
      assignments.push(assignmentFromResult(result, audit.persisted));
      if (result.status === 'degraded' && job.priority === 'critical') escalations.push(`${job.name}: ${result.message}`);
    }

    const discoveryRan = assignments.some((assignment) => assignment.job === 'gem-discovery' && assignment.status !== 'skipped');
    const marketFreshEnough = dataQuality.status !== 'offline' && !dataQuality.staleDomains.includes('market');
    if (discoveryRan && readiness.database.configured && marketFreshEnough) {
      const vector = await runOpportunityDirector();
      assignments.push(vector);
      if (vector.status !== 'completed') escalations.push(`opportunity-director: ${vector.message}`);
    } else if (discoveryRan && !marketFreshEnough) {
      escalations.push('opportunity-director: skipped because Custodian marked market data stale or offline.');
    }
  }

  return {
    supervisor: 'mercury-supervisor',
    mode: 'shadow',
    capitalExecutionEnabled: false,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    dueJobs: selected.length,
    assignments,
    completed: assignments.filter((assignment) => assignment.status === 'completed').length,
    degraded: assignments.filter((assignment) => assignment.status === 'degraded').length,
    skipped: assignments.filter((assignment) => assignment.status === 'skipped').length,
    escalations,
    controls: { governance, dataQuality },
  };
}
