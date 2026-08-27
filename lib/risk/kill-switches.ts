import { runDataQualityAgent } from '@/lib/agents/data-quality';
import { runGovernanceAgent } from '@/lib/agents/governance';
import { getLatestAgentHeartbeats } from '@/lib/agents/heartbeat';
import { getSql } from '@/lib/db';

export interface KillSwitchState {
  key: string;
  label: string;
  tripped: boolean;
  severity: 'warning' | 'critical';
  detail: string;
}

export async function getKillSwitchNetwork() {
  const [dataQuality, fleet] = await Promise.all([runDataQualityAgent(), getLatestAgentHeartbeats()]);
  const governance = runGovernanceAgent();
  const staleMinutes = Math.max(2, Number(process.env.AGENT_STALE_MINUTES ?? 35));
  const failureThreshold = Math.max(1, Number(process.env.AGENT_FAILURE_KILL_THRESHOLD ?? 3));
  const maxShadowDrawdownPct = Math.max(1, Number(process.env.MAX_SHADOW_DRAWDOWN_PCT ?? 12));
  const now = Date.now();
  const staleAgents = fleet.heartbeats.filter((row) => now - row.observedAt.getTime() > staleMinutes * 60_000);
  const failingAgents = fleet.heartbeats.filter((row) => row.consecutiveFailures >= failureThreshold);

  let unresolvedCriticalIncidents = 0;
  let latestDrawdownPct = 0;
  const sql = getSql();
  if (sql) {
    try {
      const [incident] = await sql`SELECT count(*) AS count FROM risk_incidents WHERE severity = 'critical' AND resolved = false`;
      unresolvedCriticalIncidents = Number(incident?.count ?? 0);
      const [portfolio] = await sql`SELECT drawdown_pct FROM shadow_portfolio_snapshots ORDER BY observed_at DESC LIMIT 1`;
      latestDrawdownPct = Math.abs(Number(portfolio?.drawdown_pct ?? 0));
    } catch {
      unresolvedCriticalIncidents = 0;
      latestDrawdownPct = 0;
    }
  }

  const switches: KillSwitchState[] = [
    {
      key: 'emergency-halt', label: 'Emergency research halt', severity: 'critical',
      tripped: process.env.AUTONOMY_HALT === 'true',
      detail: process.env.AUTONOMY_HALT === 'true' ? 'AUTONOMY_HALT is enabled.' : 'Emergency halt is not active.',
    },
    {
      key: 'governance', label: 'Authority violation', severity: 'critical',
      tripped: governance.status === 'degraded',
      detail: governance.status === 'degraded' ? governance.authorityViolations.join(', ') : 'Agent authority boundaries are healthy.',
    },
    {
      key: 'database', label: 'Persistent warehouse unavailable', severity: 'critical',
      tripped: dataQuality.status === 'offline',
      detail: dataQuality.status === 'offline' ? 'Persistent database is unavailable.' : 'Persistent warehouse is reachable.',
    },
    {
      key: 'market-stale', label: 'Market data stale', severity: 'critical',
      tripped: dataQuality.staleDomains.includes('market'),
      detail: dataQuality.staleDomains.includes('market') ? 'Market freshness exceeds the configured threshold.' : 'Market data freshness is within limits.',
    },
    {
      key: 'fleet-stale', label: 'Agent telemetry stale', severity: 'warning',
      tripped: fleet.persistent && staleAgents.length > 0,
      detail: fleet.persistent ? `${staleAgents.length} agent heartbeats exceed ${staleMinutes} minutes.` : 'Heartbeat persistence is not active.',
    },
    {
      key: 'fleet-failures', label: 'Repeated agent failures', severity: 'critical',
      tripped: failingAgents.length > 0,
      detail: `${failingAgents.length} agents meet or exceed ${failureThreshold} consecutive failures.`,
    },
    {
      key: 'critical-incidents', label: 'Unresolved critical risk incidents', severity: 'critical',
      tripped: unresolvedCriticalIncidents > 0,
      detail: `${unresolvedCriticalIncidents} unresolved critical incidents.`,
    },
    {
      key: 'drawdown', label: 'Shadow drawdown governor', severity: 'critical',
      tripped: latestDrawdownPct >= maxShadowDrawdownPct,
      detail: `Latest shadow drawdown ${latestDrawdownPct.toFixed(2)}%, limit ${maxShadowDrawdownPct.toFixed(2)}%.`,
    },
  ];

  const criticalTrips = switches.filter((item) => item.tripped && item.severity === 'critical');
  return {
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
    researchExecutionAllowed: criticalTrips.length === 0,
    criticalTrips: criticalTrips.length,
    warnings: switches.filter((item) => item.tripped && item.severity === 'warning').length,
    switches,
    measuredAt: new Date().toISOString(),
  };
}
