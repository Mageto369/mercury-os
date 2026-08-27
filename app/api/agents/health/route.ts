import { NextResponse } from 'next/server';
import { agentRegistry } from '@/lib/agents/registry';
import { getLatestAgentHeartbeats } from '@/lib/agents/heartbeat';

export const runtime = 'nodejs';

export async function GET() {
  const result = await getLatestAgentHeartbeats();
  const byAgent = new Map(result.heartbeats.map((row) => [row.agentId, row]));
  const staleAfterMinutes = Math.max(2, Number(process.env.AGENT_STALE_MINUTES ?? 35));
  const now = Date.now();

  const agents = agentRegistry.map((agent) => {
    const heartbeat = byAgent.get(agent.id);
    const stale = heartbeat ? now - new Date(heartbeat.observedAt).getTime() > staleAfterMinutes * 60_000 : true;
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      status: heartbeat?.status ?? 'never_run',
      stale,
      consecutiveFailures: heartbeat?.consecutiveFailures ?? 0,
      currentMission: heartbeat?.currentMission ?? null,
      observedAt: heartbeat?.observedAt ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    persistent: result.persistent,
    mode: 'shadow',
    capitalExecutionEnabled: false,
    staleAfterMinutes,
    healthy: agents.filter((agent) => !agent.stale && agent.status === 'completed').length,
    degraded: agents.filter((agent) => agent.status === 'degraded').length,
    stale: agents.filter((agent) => agent.stale).length,
    agents,
  });
}
