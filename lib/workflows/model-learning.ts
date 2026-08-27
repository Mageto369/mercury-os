import { randomUUID } from 'node:crypto';
import { desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { replayRuns } from '@/lib/db/ops-schema';
import { decisionLogs, opportunities, securities, systemEvents } from '@/lib/db/schema';

export interface LearningMetric {
  name: string;
  value: number;
}

export interface ModelLearningResult {
  replayRunId: string;
  opportunitiesReviewed: number;
  decisionsReviewed: number;
  metrics: LearningMetric[];
  driftDetected: boolean;
}

export async function runModelLearningWorkflow(): Promise<ModelLearningResult> {
  const db = getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const replayRunId = randomUUID();
  const startedAt = new Date();
  const lookbackDays = Math.max(1, Math.min(365, Number(process.env.LEARNING_LOOKBACK_DAYS ?? 30)));
  const modelVersion = process.env.MODEL_VERSION ?? 'mercury-live-shadow-v1';
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  await db.insert(replayRuns).values({
    id: replayRunId,
    modelVersion,
    status: 'running',
    lookbackDays,
    startedAt,
  });

  const opportunityRows = await db
    .select({
      symbol: securities.symbol,
      alpha: opportunities.alpha,
      asymmetry: opportunities.asymmetry,
      confidence: opportunities.confidence,
      trapRisk: opportunities.trapRisk,
      peakRisk: opportunities.peakRisk,
      hardBlocked: opportunities.hardBlocked,
      action: opportunities.action,
      observedAt: opportunities.observedAt,
    })
    .from(opportunities)
    .innerJoin(securities, eq(opportunities.securityId, securities.id))
    .where(gte(opportunities.observedAt, cutoff))
    .orderBy(desc(opportunities.observedAt))
    .limit(2000);

  const decisionRows = await db
    .select({ decision: decisionLogs.decision, createdAt: decisionLogs.createdAt })
    .from(decisionLogs)
    .where(gte(decisionLogs.createdAt, cutoff))
    .orderBy(desc(decisionLogs.createdAt))
    .limit(3000);

  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const blockedRate = opportunityRows.length ? opportunityRows.filter((row) => row.hardBlocked).length / opportunityRows.length : 0;
  const highConfidence = opportunityRows.filter((row) => row.confidence >= 75);
  const highRiskHighConfidence = highConfidence.filter((row) => row.trapRisk >= 65 || row.peakRisk >= 75);
  const conflictRate = highConfidence.length ? highRiskHighConfidence.length / highConfidence.length : 0;

  const metrics: LearningMetric[] = [
    { name: 'mean_alpha', value: Number(mean(opportunityRows.map((row) => row.alpha)).toFixed(2)) },
    { name: 'mean_asymmetry', value: Number(mean(opportunityRows.map((row) => row.asymmetry)).toFixed(2)) },
    { name: 'blocked_rate', value: Number((blockedRate * 100).toFixed(2)) },
    { name: 'confidence_risk_conflict_rate', value: Number((conflictRate * 100).toFixed(2)) },
  ];

  const driftDetected = conflictRate >= 0.18 || blockedRate >= 0.45;

  if (driftDetected) {
    const eventKey = `model-learning:${new Date().toISOString().slice(0, 10)}`;
    await db.insert(systemEvents).values({
      id: randomUUID(),
      eventKey,
      category: 'model:drift',
      severity: 'high',
      source: 'replay-agent',
      message: `Replay detected model-quality drift across ${opportunityRows.length} shadow opportunities.`,
      payload: { metrics, lookbackDays, replayRunId, modelVersion },
    }).onConflictDoNothing({ target: systemEvents.eventKey });
  }

  await db.update(replayRuns).set({
    status: 'completed',
    opportunitiesReviewed: opportunityRows.length,
    decisionsReviewed: decisionRows.length,
    driftDetected,
    metrics,
    completedAt: new Date(),
  }).where(eq(replayRuns.id, replayRunId));

  return {
    replayRunId,
    opportunitiesReviewed: opportunityRows.length,
    decisionsReviewed: decisionRows.length,
    metrics,
    driftDetected,
  };
}
