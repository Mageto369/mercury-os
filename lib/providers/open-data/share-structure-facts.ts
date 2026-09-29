import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";

/** Prefer a point-in-time common-share count over issued shares, then authorized. */
export const OUTSTANDING_SHARE_CONCEPTS = [
  "CommonStockSharesOutstanding",
  "EntityCommonStockSharesOutstanding",
  "CommonStockSharesIssued",
] as const;

export const AUTHORIZED_SHARE_CONCEPT = "CommonStockSharesAuthorized";

export function outstandingConceptRank(concept: string) {
  const index = OUTSTANDING_SHARE_CONCEPTS.indexOf(concept as (typeof OUTSTANDING_SHARE_CONCEPTS)[number]);
  return index === -1 ? OUTSTANDING_SHARE_CONCEPTS.length : index;
}

export async function syncShareStructureFromCompanyFacts() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: "database_not_configured" as const, upserted: 0 };
  const rows = await sql.begin(async (tx) => {
  const upserted = await tx<{ id: string }[]>`
    WITH preferred AS (
      SELECT DISTINCT ON (security_id, coalesce(period_end, filed_at::date))
        security_id,
        value,
        coalesce(period_end, filed_at::date) AS as_of
      FROM sec_company_facts
      WHERE concept IN ('CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding', 'CommonStockSharesIssued')
        AND unit = 'shares'
        AND value > 0
        AND coalesce(period_end, filed_at::date) IS NOT NULL
      ORDER BY security_id, coalesce(period_end, filed_at::date),
        CASE concept
          WHEN 'CommonStockSharesOutstanding' THEN 0
          WHEN 'EntityCommonStockSharesOutstanding' THEN 1
          ELSE 2
        END
    ),
    outstanding AS (
      SELECT security_id, value, as_of
      FROM (
        SELECT preferred.*, row_number() OVER (PARTITION BY security_id ORDER BY as_of DESC) AS rn
        FROM preferred
      ) ranked
      WHERE rn <= 2
    ),
    authorized AS (
      SELECT DISTINCT ON (security_id) security_id, value
      FROM sec_company_facts
      WHERE concept = 'CommonStockSharesAuthorized' AND unit = 'shares' AND value > 0
      ORDER BY security_id, coalesce(period_end, filed_at::date) DESC NULLS LAST
    )
    INSERT INTO share_structures (id, security_id, authorized_shares, outstanding_shares, float_shares, verified, source, observed_at)
    SELECT
      'sec-facts:' || o.security_id || ':' || o.as_of::text,
      o.security_id,
      a.value,
      o.value,
      NULL,
      false,
      'sec-companyfacts',
      o.as_of::timestamptz
    FROM outstanding o
    LEFT JOIN authorized a ON a.security_id = o.security_id
    ON CONFLICT (id) DO UPDATE SET
      authorized_shares = EXCLUDED.authorized_shares,
      outstanding_shares = EXCLUDED.outstanding_shares,
      source = EXCLUDED.source
    RETURNING id
  `;
  if (upserted.length > 0) {
    const ingestId = randomUUID();
    await tx`
      INSERT INTO system_events (id, event_key, category, severity, source, message, payload, observed_at)
      VALUES (
        ${`structure-ingest:${ingestId}`},
        ${`structure:ingest:${ingestId}`},
        'structure:ingest',
        'info',
        'sec-companyfacts',
        ${`Share structure sync upserted ${upserted.length} company-fact rows.`},
        ${JSON.stringify({ upserted: upserted.length, verified: false })}::jsonb,
        now()
      )
    `;
  }
  return upserted;
  });
  return { ok: true as const, source: "sec-companyfacts" as const, upserted: rows.length, verified: false as const };
}
