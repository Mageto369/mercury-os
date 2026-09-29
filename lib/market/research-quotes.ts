import { getSql } from "@/lib/db";

export const DELAYED_REFERENCE_MODEL = "mercury-delayed-reference-v1";
export const LIVE_SHADOW_MODEL = "mercury-live-shadow-v1";
export const REFERENCE_QUOTE_FRESH_HOURS = 36;

export type QuoteEvidenceClass = "live" | "delayed-reference";

export interface ResearchQuote {
  securityId: string;
  symbol: string;
  price: number;
  dollarVolume: number;
  spreadBps: number | null;
  rvol: number | null;
  floatRotation: number | null;
  observedAt: Date;
  evidenceClass: QuoteEvidenceClass;
}

interface ResearchQuoteRecord {
  security_id: string;
  symbol: string;
  price: string | number;
  dollar_volume: string | number | null;
  spread_bps: number | null;
  rvol: string | number | null;
  float_rotation: string | number | null;
  observed_at: Date | string;
  evidence_class: string;
}

function numberOrNull(value: string | number | null | undefined) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function quoteFromRecord(record: ResearchQuoteRecord): ResearchQuote {
  const evidenceClass: QuoteEvidenceClass =
    record.evidence_class === "delayed-reference" ? "delayed-reference" : "live";
  return {
    securityId: String(record.security_id),
    symbol: String(record.symbol),
    price: Number(record.price),
    dollarVolume: numberOrNull(record.dollar_volume) ?? 0,
    spreadBps: record.spread_bps,
    rvol: numberOrNull(record.rvol),
    floatRotation: numberOrNull(record.float_rotation),
    observedAt: new Date(record.observed_at),
    evidenceClass,
  };
}

/** Live quotes win. Delayed reference fills symbols that have no live quote in the window. */
export function mergeResearchQuotes(live: ResearchQuote[], reference: ResearchQuote[]) {
  const bySecurity = new Map<string, ResearchQuote>();
  for (const quote of live) bySecurity.set(quote.securityId, { ...quote, evidenceClass: "live" });
  for (const quote of reference) {
    if (!bySecurity.has(quote.securityId)) {
      bySecurity.set(quote.securityId, { ...quote, evidenceClass: "delayed-reference" });
    }
  }
  return [...bySecurity.values()];
}

export async function loadResearchQuotes(liveLookbackMinutes: number) {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const minutes = Math.max(1, Math.round(liveLookbackMinutes));
  const rows = await sql<ResearchQuoteRecord[]>`
    WITH live AS (
      SELECT DISTINCT ON (m.security_id)
        m.security_id, s.symbol, m.price, m.dollar_volume, m.spread_bps, m.rvol, m.float_rotation, m.observed_at,
        'live'::text AS evidence_class
      FROM market_snapshots m
      JOIN securities s ON s.id = m.security_id
      WHERE s.id NOT LIKE 'validation:%'
        AND m.observed_at >= now() - make_interval(mins => ${minutes})
        AND coalesce(m.payload->>'evidenceClass', 'live') <> 'delayed-reference'
      ORDER BY m.security_id, m.observed_at DESC
    ),
    reference AS (
      SELECT DISTINCT ON (m.security_id)
        m.security_id, s.symbol, m.price, m.dollar_volume, m.spread_bps, m.rvol, m.float_rotation, m.observed_at,
        'delayed-reference'::text AS evidence_class
      FROM market_snapshots m
      JOIN securities s ON s.id = m.security_id
      WHERE s.id NOT LIKE 'validation:%'
        AND m.payload->>'evidenceClass' = 'delayed-reference'
        AND coalesce(nullif(m.payload->>'ingestedAt', '')::timestamptz, m.observed_at) >= now() - make_interval(hours => ${REFERENCE_QUOTE_FRESH_HOURS})
        AND NOT EXISTS (SELECT 1 FROM live WHERE live.security_id = m.security_id)
      ORDER BY m.security_id, coalesce(nullif(m.payload->>'ingestedAt', '')::timestamptz, m.observed_at) DESC
    )
    SELECT * FROM live
    UNION ALL
    SELECT * FROM reference
  `;
  return rows.map(quoteFromRecord);
}
