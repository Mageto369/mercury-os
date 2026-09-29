import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { toJsonb } from "@/lib/db/json";
import { EMPTY_PRICE_PUSH, scorePricePush, type FilingObservation, type PricePush, type SocialObservation } from "@/lib/market/price-push";
import { fetchStocktwitsSnapshot } from "@/lib/market/stocktwits";

function isoDay(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

export async function loadPricePush(symbols: string[]) {
  const wanted = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const pushes = new Map<string, PricePush>();
  for (const symbol of wanted) pushes.set(symbol, EMPTY_PRICE_PUSH);
  if (!wanted.length) return pushes;
  const sql = getSql();
  if (!sql) return pushes;
  const asOf = new Date().toISOString().slice(0, 10);
  const [filings, social] = await Promise.all([
    sql<{ symbol: string; form: string; filed_at: Date | string }[]>`
      select s.symbol, f.form, f.filed_at
      from filings f
      join securities s on s.id = f.security_id
      where upper(s.symbol) in ${sql(wanted)}
        and f.filed_at > now() - interval '14 days'
        and s.id not like 'validation:%'
    `,
    sql<{ symbol: string; engagement: number | null; payload: SocialObservation | null }[]>`
      select distinct on (s.symbol) s.symbol, m.engagement, m.payload
      from social_mentions m
      join securities s on s.id = m.security_id
      where upper(s.symbol) in ${sql(wanted)}
        and m.source = 'stocktwits'
        and m.observed_at > now() - interval '36 hours'
        and s.id not like 'validation:%'
      order by s.symbol, m.observed_at desc
    `,
  ]);
  const filingsBySymbol = new Map<string, FilingObservation[]>();
  for (const row of filings) {
    const symbol = String(row.symbol).toUpperCase();
    const bucket = filingsBySymbol.get(symbol) ?? [];
    bucket.push({ form: String(row.form), filedOn: isoDay(row.filed_at) });
    filingsBySymbol.set(symbol, bucket);
  }
  const socialBySymbol = new Map<string, SocialObservation>();
  for (const row of social) {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) as SocialObservation : row.payload;
    if (!payload || typeof payload !== "object") continue;
    socialBySymbol.set(String(row.symbol).toUpperCase(), {
      mentions: Number(payload.mentions ?? row.engagement ?? 0),
      bullish: Number(payload.bullish ?? 0),
      bearish: Number(payload.bearish ?? 0),
      watchers: Number(payload.watchers ?? 0),
    });
  }
  for (const symbol of wanted) {
    pushes.set(symbol, scorePricePush(filingsBySymbol.get(symbol) ?? [], socialBySymbol.get(symbol) ?? null, asOf));
  }
  return pushes;
}

export async function syncStocktwitsSnapshots(symbols: string[]) {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: "database_not_configured" as const, inserted: 0, requested: 0 };
  const wanted = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  if (!wanted.length) return { ok: true as const, inserted: 0, requested: 0, errors: [] as string[] };
  const securities = await sql<{ id: string; symbol: string }[]>`
    select id, symbol from securities
    where upper(symbol) in ${sql(wanted)} and active = true and id not like 'validation:%'
  `;
  const ids = new Map(securities.map((row) => [String(row.symbol).toUpperCase(), String(row.id)]));
  let inserted = 0;
  const errors: string[] = [];
  for (let index = 0; index < wanted.length; index += 4) {
    const batch = wanted.slice(index, index + 4);
    const results = await Promise.all(batch.map(async (symbol) => {
      const securityId = ids.get(symbol);
      if (!securityId) return { symbol, securityId: null as string | null, snapshot: null, error: "security_not_tracked" };
      try {
        const snapshot = await fetchStocktwitsSnapshot(symbol);
        return { symbol, securityId, snapshot, error: snapshot ? null : "social_snapshot_unreadable" };
      } catch (error) {
        return { symbol, securityId, snapshot: null, error: error instanceof Error ? error.message : "social_fetch_failed" };
      }
    }));
    for (const result of results) {
      if (result.error) errors.push(`${result.symbol}:${result.error}`);
      if (!result.securityId || !result.snapshot) continue;
      const tagged = result.snapshot.bullish + result.snapshot.bearish;
      const sentiment = tagged > 0 ? Math.round((result.snapshot.bullish / tagged) * 100) : null;
      await sql`
        insert into social_mentions (id, security_id, source, source_ref, sentiment, promotion_risk, engagement, payload, observed_at)
        values (
          ${randomUUID()},
          ${result.securityId},
          'stocktwits',
          ${`stocktwits:${result.symbol}:${new Date().toISOString().slice(0, 10)}`},
          ${sentiment},
          0,
          ${result.snapshot.mentions},
          ${toJsonb(result.snapshot)}::jsonb,
          now()
        )
      `;
      inserted += 1;
    }
  }
  return { ok: errors.length < wanted.length, inserted, requested: wanted.length, errors, capitalExecutionEnabled: false as const };
}
