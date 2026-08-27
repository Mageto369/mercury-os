import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { autonomousActions, workflowRuns } from '@/lib/db/schema';
import type { AutonomousJobResult } from '@/lib/autonomy/executor';

export async function persistAutonomousResult(result: AutonomousJobResult, trigger: 'cron' | 'manual' = 'cron') {
  const db = getDb();
  if (!db) return { persisted: false as const, reason: 'database_not_configured' as const };

  const workflowRunId = randomUUID();
  const actionId = randomUUID();

  try {
    await db.insert(workflowRuns).values({
      id: workflowRunId,
      workflow: result.name,
      status: result.status,
      trigger,
      startedAt: new Date(result.startedAt),
      completedAt: new Date(result.completedAt),
      stats: {
        actionCount: result.actionCount,
        configuredProviders: result.configuredProviders,
        missingProviders: result.missingProviders,
      },
    });

    await db.insert(autonomousActions).values({
      id: actionId,
      workflowRunId,
      job: result.name,
      actionType: 'research_dispatch',
      status: result.status,
      shadowOnly: true,
      providerRequirements: result.requiredProviders,
      providerState: {
        configured: result.configuredProviders,
        missing: result.missingProviders,
      },
      payload: {
        message: result.message,
        actionCount: result.actionCount,
      },
    });

    return { persisted: true as const, workflowRunId, actionId };
  } catch (error) {
    return {
      persisted: false as const,
      reason: 'database_write_failed' as const,
      error: error instanceof Error ? error.message : 'unknown database error',
    };
  }
}
