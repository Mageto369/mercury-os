import { agentRegistry } from '@/lib/agents/registry';
import { evaluateAutonomyGuardrails } from '@/lib/risk/autonomy-guardrails';

export interface GovernanceResult {
  status: 'healthy' | 'degraded';
  capitalExecutionEnabled: false;
  authorityViolations: string[];
  guardrailReasons: string[];
}

export function runGovernanceAgent(): GovernanceResult {
  const guardrails = evaluateAutonomyGuardrails();
  const authorityViolations: string[] = [];

  for (const agent of agentRegistry) {
    const authority = agent.authority.map((value) => value.toLowerCase());
    if (authority.includes('trade' as never) || authority.includes('broker' as never)) {
      authorityViolations.push(`${agent.id}: prohibited authority`);
    }
    if (!agent.hardLimits.length) authorityViolations.push(`${agent.id}: missing hard limits`);
  }

  return {
    status: authorityViolations.length ? 'degraded' : 'healthy',
    capitalExecutionEnabled: false,
    authorityViolations,
    guardrailReasons: guardrails.reasons,
  };
}
