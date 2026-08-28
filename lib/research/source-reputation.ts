import { getSql } from '@/lib/db';
import { toJsonb } from '@/lib/db/json';

export async function refreshSourceReputation() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const, updated: 0 };

  const rows = await sql`
    WITH source_events AS (
      SELECT
        sm.source AS source_type,
        coalesce(sm.source_ref, sm.source) AS source_ref,
        sm.promotion_risk,
        sm.observed_at,
        o.id AS opportunity_id,
        o.observed_at AS opportunity_at,
        oo.return_60m,
        extract(epoch from (o.observed_at - sm.observed_at)) / 60.0 AS lead_minutes
      FROM social_mentions sm
      JOIN opportunities o
        ON o.security_id = sm.security_id
       AND sm.observed_at BETWEEN o.observed_at - interval '90 minutes' AND o.observed_at + interval '30 minutes'
      LEFT JOIN opportunity_outcomes oo ON oo.opportunity_id = o.id AND oo.matured_60m = true
    )
    SELECT
      source_type,
      source_ref,
      count(*) AS observations,
      avg(CASE WHEN lead_minutes > 0 THEN 1.0 ELSE 0.0 END) AS lead_rate,
      avg(CASE WHEN lead_minutes <= 0 THEN 1.0 ELSE 0.0 END) AS late_rate,
      avg(CASE WHEN promotion_risk >= 60 THEN 1.0 ELSE 0.0 END) AS promotion_rate,
      avg(CASE WHEN return_60m > 0 THEN 1.0 ELSE 0.0 END) FILTER (WHERE return_60m IS NOT NULL) AS positive_60m_rate,
      percentile_cont(0.5) within group (order by lead_minutes) FILTER (WHERE lead_minutes > 0) AS median_lead_minutes
    FROM source_events
    GROUP BY source_type, source_ref
    ORDER BY observations DESC
    LIMIT 500
  `;

  let updated = 0;
  for (const row of rows) {
    const observations = Number(row.observations ?? 0);
    const leadRate = Number(row.lead_rate ?? 0);
    const lateRate = Number(row.late_rate ?? 0);
    const promotionRate = Number(row.promotion_rate ?? 0);
    const positive60mRate = Number(row.positive_60m_rate ?? 0);
    const medianLeadMinutes = row.median_lead_minutes == null ? null : Number(row.median_lead_minutes);
    const reliability = Math.max(0, Math.min(100, Math.round(
      50 + positive60mRate * 35 + leadRate * 20 - lateRate * 12 - promotionRate * 25 + Math.min(10, Math.log10(Math.max(1, observations)) * 5)
    )));
    await sql`
      INSERT INTO source_reputation (
        id, source_type, source_ref, observations, lead_rate, late_rate, promotion_rate,
        positive_60m_rate, median_lead_minutes, reliability_score, payload, updated_at
      ) VALUES (
        ${`source:${row.source_type}:${row.source_ref}`}, ${String(row.source_type)}, ${String(row.source_ref)},
        ${observations}, ${leadRate}, ${lateRate}, ${promotionRate}, ${positive60mRate}, ${medianLeadMinutes}, ${reliability},
        ${toJsonb({ method: 'outcome-linked-v1', shadowOnly: true })}::jsonb, now()
      )
      ON CONFLICT (source_type, source_ref) DO UPDATE SET
        observations = excluded.observations,
        lead_rate = excluded.lead_rate,
        late_rate = excluded.late_rate,
        promotion_rate = excluded.promotion_rate,
        positive_60m_rate = excluded.positive_60m_rate,
        median_lead_minutes = excluded.median_lead_minutes,
        reliability_score = excluded.reliability_score,
        payload = excluded.payload,
        updated_at = now()
    `;
    updated += 1;
  }

  return { ok: true as const, mode: 'shadow' as const, capitalExecutionEnabled: false as const, updated, measuredAt: new Date().toISOString() };
}

export async function getSourceReputation(limit = 50) {
  const sql = getSql();
  if (!sql) return { available: false as const, reason: 'database_not_configured' as const, sources: [] };
  const rows = await sql`
    SELECT source_type, source_ref, observations, lead_rate, late_rate, promotion_rate,
           positive_60m_rate, median_lead_minutes, reliability_score, updated_at
    FROM source_reputation
    ORDER BY reliability_score DESC, observations DESC
    LIMIT ${Math.max(1, Math.min(500, limit))}
  `;
  return { available: true as const, mode: 'shadow' as const, capitalExecutionEnabled: false as const, sources: rows, measuredAt: new Date().toISOString() };
}
