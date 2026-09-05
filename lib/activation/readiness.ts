import { runDataQualityAgent } from '@/lib/agents/data-quality';
import { runGovernanceAgent } from '@/lib/agents/governance';
import { getLatestAgentHeartbeats } from '@/lib/agents/heartbeat';
import { agentRegistry } from '@/lib/agents/registry';
import { getProviderReadiness } from '@/lib/autonomy/providers';
import { evaluateAutonomyGuardrails } from '@/lib/risk/autonomy-guardrails';

export interface ReadinessGate {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  status: 'ready' | 'partial' | 'blocked';
  detail: string;
}

export async function getProductionReadiness() {
  const providers = await getProviderReadiness();
  const dataQuality = await runDataQualityAgent();
  const governance = await runGovernanceAgent(await evaluateAutonomyGuardrails(providers));
  const fleet = await getLatestAgentHeartbeats();
  const heartbeatMaxAgeMinutes = Math.max(2, Number(process.env.AGENT_STALE_MINUTES ?? 15));
  const now = Date.now();
  const freshHeartbeats = fleet.heartbeats.filter((row) => now - row.observedAt.getTime() <= heartbeatMaxAgeMinutes * 60_000);
  const healthyHeartbeats = freshHeartbeats.filter((row) => row.status !== 'degraded');

  const configuredOptional = Object.entries(providers).filter(([key, state]) => key !== 'database' && key !== 'marketData' && state.configured).length;
  const optionalTotal = Object.keys(providers).length - 2;

  const gates: ReadinessGate[] = [
    {
      key: 'database', label: 'Persistent warehouse', maxScore: 20,
      score: providers.database.configured ? 20 : 0,
      status: providers.database.configured ? 'ready' : 'blocked',
      detail: providers.database.configured ? 'Database connection configured.' : 'Set DATABASE_URL or POSTGRES_URL.',
    },
    {
      key: 'market', label: 'Live market intelligence', maxScore: 20,
      score: providers.marketData.configured && !dataQuality.staleDomains.includes('market') ? 20 : providers.marketData.configured ? 8 : 0,
      status: providers.marketData.configured && !dataQuality.staleDomains.includes('market') ? 'ready' : providers.marketData.configured ? 'partial' : 'blocked',
      detail: !providers.marketData.configured ? 'Market provider missing.' : dataQuality.staleDomains.includes('market') ? 'Provider configured but market observations are stale.' : 'Market provider and freshness gate are healthy.',
    },
    {
      key: 'fleet', label: 'Agent fleet telemetry', maxScore: 20,
      score: !fleet.persistent ? 0 : Math.round(20 * Math.min(1, healthyHeartbeats.length / agentRegistry.length)),
      status: fleet.persistent && healthyHeartbeats.length === agentRegistry.length ? 'ready' : fleet.persistent && healthyHeartbeats.length > 0 ? 'partial' : 'blocked',
      detail: fleet.persistent ? `${healthyHeartbeats.length}/${agentRegistry.length} agents have fresh non-degraded heartbeats.` : 'No persistent heartbeat store.',
    },
    {
      key: 'governance', label: 'Governance and execution lock', maxScore: 20,
      score: governance.status === 'healthy' && governance.capitalExecutionEnabled === false ? 20 : 0,
      status: governance.status === 'healthy' && governance.capitalExecutionEnabled === false ? 'ready' : 'blocked',
      detail: governance.status === 'healthy' ? 'Authority boundaries healthy and capital execution locked.' : `Authority violations: ${governance.authorityViolations.join(', ')}`,
    },
    {
      key: 'providers', label: 'Research provider coverage', maxScore: 20,
      score: Math.round(20 * (configuredOptional / optionalTotal)),
      status: configuredOptional === optionalTotal ? 'ready' : configuredOptional > 0 ? 'partial' : 'blocked',
      detail: `${configuredOptional}/${optionalTotal} optional research providers configured.`,
    },
  ];

  const score = gates.reduce((sum, gate) => sum + gate.score, 0);
  const blockers = gates.filter((gate) => gate.status === 'blocked').map((gate) => gate.key);
  const level = score >= 90 && blockers.length === 0 ? 'production-ready' : score >= 65 ? 'shadow-ready' : score >= 35 ? 'integration' : 'offline';

  return {
    score,
    level,
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
    blockers,
    gates,
    providers,
    dataQuality,
    measuredAt: new Date().toISOString(),
  };
}
