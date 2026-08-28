import { getSql } from '@/lib/db';
import { toJsonb } from '@/lib/db/json';

export async function getModelGovernance() {
  const sql = getSql();
  if (!sql) return {
    available: false as const,
    reason: 'database_not_configured' as const,
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
    champions: [],
    challengers: [],
    experiments: [],
  };

  const models = await sql`
    SELECT id, model_key, version, role, status, strategy, regime, validation_metrics, promotion_metrics,
           parent_version, created_at, promoted_at, retired_at
    FROM model_registry
    ORDER BY created_at DESC
    LIMIT 100
  `;
  const experiments = await sql`
    SELECT id, model_key, model_version, experiment_type, status, regime, sample_size, metrics,
           leakage_checks, cost_assumptions, started_at, completed_at
    FROM experiment_runs
    ORDER BY started_at DESC
    LIMIT 50
  `;

  return {
    available: true as const,
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
    champions: models.filter((model) => model.role === 'champion' && model.status !== 'retired'),
    challengers: models.filter((model) => model.role === 'challenger' && model.status !== 'retired'),
    retired: models.filter((model) => model.status === 'retired'),
    experiments,
    measuredAt: new Date().toISOString(),
  };
}

export async function ensureBaselineModel() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const };
  const version = process.env.MODEL_VERSION ?? 'mercury-live-shadow-v1';
  await sql`
    INSERT INTO model_registry (
      id, model_key, version, role, status, strategy, regime, feature_manifest,
      validation_metrics, promotion_metrics, created_at
    ) VALUES (
      ${`model:mercury-opportunity:${version}`}, 'mercury-opportunity', ${version}, 'champion', 'shadow',
      'microcap-opportunity', 'all',
      ${toJsonb({ families: ['catalyst','liquidity','attention','structure','dilution','regime','distribution'], shadowOnly: true })}::jsonb,
      ${toJsonb({ status: 'collecting-evidence' })}::jsonb,
      ${toJsonb({ requiresOutOfSampleEvidence: true, brokerAuthority: false })}::jsonb, now()
    )
    ON CONFLICT (model_key, version) DO NOTHING
  `;
  return { ok: true as const, modelKey: 'mercury-opportunity', version, role: 'champion' as const, status: 'shadow' as const };
}
