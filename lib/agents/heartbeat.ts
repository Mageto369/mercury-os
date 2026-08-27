import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { agentHeartbeats } from '@/lib/db/ops-schema';
import type { AgentId } from '@/lib/agents/registry';

export async function recordAgentHeartbeat(input: {
  agentId: AgentId;
  status: 'completed' | 'degraded' | 'skipped';
  mission: string;
  details?: Record<string, unknown>;
}) {
  const db = getDb();
  if (!db) return { persisted: false as const, reason: 'database_not_configured' as const };

  const [previous] = await db
    .select()
    .from(agentHeartbeats)
    .where(eq(agentHeartbeats.agentId, input.agentId))
    .orderBy(desc(agentHeartbeats.observedAt))
    .limit(1);

  const now = new Date();
  const failed = input.status === 'degraded';
  const consecutiveFailures = failed ? (previous?.consecutiveFailures ?? 0) + 1 : 0;

  await db.insert(agentHeartbeats).values({
    id: randomUUID(),
    agentId: input.agentId,
    status: input.status,
    mode: 'shadow',
    currentMission: input.mission,
    lastSuccessAt: failed ? previous?.lastSuccessAt ?? null : now,
    lastFailureAt: failed ? now : previous?.lastFailureAt ?? null,
    consecutiveFailures,
    details: input.details ?? {},
    observedAt: now,
  });

  return { persisted: true as const, consecutiveFailures };
}

export async function getLatestAgentHeartbeats() {
  const db = getDb();
  if (!db) return { persistent: false as const, heartbeats: [] };
  const rows = await db.select().from(agentHeartbeats).orderBy(desc(agentHeartbeats.observedAt)).limit(250);
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.agentId)) latest.set(row.agentId, row);
  return { persistent: true as const, heartbeats: [...latest.values()] };
}
