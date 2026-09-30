import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { toJsonb } from "@/lib/db/json";
import { syncNasdaqDailyHistory } from "@/lib/market/daily-history";
import { EMPTY_PRICE_PUSH, scorePricePush, type FilingObservation, type PricePush, type SocialObservation } from "@/lib/market/price-push";
import { fetchStocktwitsSnapshot } from "@/lib/market/stocktwits";
import { PENNY_MAX_PRICE, PENNY_MAX_SPREAD_BPS, PENNY_MIN_DOLLAR_VOLUME } from "@/lib/workflows/penny-screen";

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
    sql<{ symbol: string; engagement: number | null; payload: (SocialObservation & { unavailable?: boolean }) | string | null }[]>`
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
  const unavailable = new Set<string>();
  for (const row of social) {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) as SocialObservation & { unavailable?: boolean } : row.payload;
    const symbol = String(row.symbol).toUpperCase();
    if (!payload || typeof payload !== "object" || payload.unavailable === true) {
      if (payload && typeof payload === "object" && payload.unavailable === true) unavailable.add(symbol);
      continue;
    }
    socialBySymbol.set(symbol, {
      mentions: Number(payload.mentions ?? row.engagement ?? 0),
      bullish: Number(payload.bullish ?? 0),
      bearish: Number(payload.bearish ?? 0),
      watchers: Number(payload.watchers ?? 0),
    });
  }
  for (const symbol of wanted) {
    const scored = scorePricePush(filingsBySymbol.get(symbol) ?? [], socialBySymbol.get(symbol) ?? null, asOf);
    pushes.set(symbol, unavailable.has(symbol) ? { ...scored, socialUnavailable: true } : scored);
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
      if (!result.securityId) continue;
      if (!result.snapshot) {
        if (result.error === "http_404") {
          await sql`
            insert into social_mentions (id, security_id, source, source_ref, sentiment, promotion_risk, engagement, payload, observed_at)
            values (
              ${randomUUID()},
              ${result.securityId},
              'stocktwits',
              ${`stocktwits:${result.symbol}:unavailable`},
              ${null},
              0,
              0,
              ${toJsonb({ unavailable: true })}::jsonb,
              now()
            )
          `;
        }
        continue;
      }
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

export async function refreshStalePennyContext(limit = 8) {
  const sql = getSql();
  const empty = { socialRequested: 0, socialInserted: 0, historyRequested: 0, historyInserted: 0 };
  if (!sql) return empty;
  const cap = Math.max(1, Math.min(12, limit));
  const [socialRows, historyRows] = await Promise.all([
    sql<{ symbol: string }[]>`
      with latest as (
        select distinct on (m.security_id) s.symbol, m.price, m.dollar_volume, m.spread_bps
        from market_snapshots m
        join securities s on s.id = m.security_id
        where s.active = true and s.id not like 'validation:%'
        order by m.security_id, m.observed_at desc
      ), hype as (
        select s.symbol, max(m.observed_at) as observed_at
        from social_mentions m
        join securities s on s.id = m.security_id
        where m.source = 'stocktwits' and s.id not like 'validation:%'
        group by s.symbol
      )
      select l.symbol
      from latest l
      left join hype h on h.symbol = l.symbol
      where l.price > 0 and l.price < ${PENNY_MAX_PRICE}
        and l.dollar_volume >= ${PENNY_MIN_DOLLAR_VOLUME}
        and (l.spread_bps is null or l.spread_bps <= ${PENNY_MAX_SPREAD_BPS})
        and l.symbol !~ '[.+^/]'
        and l.symbol !~ '(WS|WW)$'
        and (h.observed_at is null or h.observed_at < now() - interval '36 hours')
      order by h.observed_at asc nulls first, l.symbol
      limit ${cap}
    `,
    sql<{ symbol: string }[]>`
      with latest as (
        select distinct on (m.security_id) s.id, s.symbol, m.price, m.dollar_volume, m.spread_bps
        from market_snapshots m
        join securities s on s.id = m.security_id
        where s.active = true and s.id not like 'validation:%'
        order by m.security_id, m.observed_at desc
      )
      select l.symbol
      from latest l
      left join historical_bars h on h.security_id = l.id and h.timeframe = '1d'
      where l.price > 0 and l.price < ${PENNY_MAX_PRICE}
        and l.dollar_volume >= ${PENNY_MIN_DOLLAR_VOLUME}
        and (l.spread_bps is null or l.spread_bps <= ${PENNY_MAX_SPREAD_BPS})
        and l.symbol !~ '[.+^/]'
        and l.symbol !~ '(WS|WW)$'
      group by l.symbol
      having count(h.id) < 20
      order by count(h.id), l.symbol
      limit ${cap}
    `,
  ]);
  const socialSymbols = socialRows.map((row) => String(row.symbol));
  const historySymbols = historyRows.map((row) => String(row.symbol));
  const [social, history] = await Promise.all([
    socialSymbols.length ? syncStocktwitsSnapshots(socialSymbols) : Promise.resolve({ inserted: 0 }),
    historySymbols.length ? syncNasdaqDailyHistory(historySymbols) : Promise.resolve({ inserted: 0 }),
  ]);
  return {
    socialRequested: socialSymbols.length,
    socialInserted: social.inserted,
    historyRequested: historySymbols.length,
    historyInserted: history.inserted,
  };
}
