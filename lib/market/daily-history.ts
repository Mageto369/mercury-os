import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { toJsonbBase64 } from "@/lib/db/json";
import { fetchNasdaqHistoricalBars, type NasdaqDailyBar, type StoredDailyBar } from "@/lib/market/nasdaq-history";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function loadDailyHistory(symbols: string[], limit = 30) {
  const wanted = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const histories = new Map<string, StoredDailyBar[]>();
  if (!wanted.length) return histories;
  const sql = getSql();
  if (!sql) return histories;
  const rows = await sql<{ symbol: string; bar_time: Date | string; close: string | number; high: string | number | null; low: string | number | null; volume: string | number | null }[]>`
    select s.symbol, h.bar_time, h.close, h.high, h.low, h.volume
    from historical_bars h
    join securities s on s.id = h.security_id
    where upper(s.symbol) in ${sql(wanted)}
      and h.timeframe = '1d'
      and s.id not like 'validation:%'
    order by s.symbol, h.bar_time desc
  `;
  const keep = Math.max(30, Math.min(120, limit));
  const grouped = new Map<string, StoredDailyBar[]>();
  for (const row of rows) {
    const symbol = String(row.symbol).toUpperCase();
    const bucket = grouped.get(symbol) ?? [];
    if (bucket.length >= keep) {
      grouped.set(symbol, bucket);
      continue;
    }
    const close = Number(row.close);
    if (!Number.isFinite(close) || close <= 0) continue;
    const volume = row.volume == null ? null : Number(row.volume);
    const high = row.high == null ? null : Number(row.high);
    const low = row.low == null ? null : Number(row.low);
    bucket.push({
      date: new Date(row.bar_time).toISOString().slice(0, 10),
      close,
      high: high != null && Number.isFinite(high) && high > 0 ? high : null,
      low: low != null && Number.isFinite(low) && low > 0 ? low : null,
      volume: volume != null && Number.isFinite(volume) ? volume : null,
    });
    grouped.set(symbol, bucket);
  }
  for (const symbol of wanted) histories.set(symbol, grouped.get(symbol) ?? []);
  return histories;
}

export async function syncNasdaqDailyHistory(symbols: string[]) {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: "database_not_configured" as const, inserted: 0, requested: 0 };
  const wanted = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  if (!wanted.length) return { ok: true as const, inserted: 0, requested: 0, errors: [] as string[] };
  const securities = await sql<{ id: string; symbol: string }[]>`
    select id, symbol from securities
    where upper(symbol) in ${sql(wanted)} and active = true and id not like 'validation:%'
  `;
  const ids = new Map(securities.map((row) => [String(row.symbol).toUpperCase(), String(row.id)]));
  const toDate = isoDay(new Date());
  const fromDate = isoDay(new Date(Date.now() - 120 * 86_400_000));
  let inserted = 0;
  const errors: string[] = [];
  const concurrency = 4;
  for (let index = 0; index < wanted.length; index += concurrency) {
    const batch = wanted.slice(index, index + concurrency);
    const results = await Promise.all(batch.map(async (symbol) => {
      const securityId = ids.get(symbol);
      if (!securityId) return { symbol, securityId: null as string | null, bars: [] as NasdaqDailyBar[], error: "security_not_tracked" };
      try {
        const bars = await fetchNasdaqHistoricalBars(symbol, fromDate, toDate);
        return { symbol, securityId, bars, error: null as string | null };
      } catch (error) {
        return { symbol, securityId, bars: [] as NasdaqDailyBar[], error: error instanceof Error ? error.message : "history_fetch_failed" };
      }
    }));
    for (const result of results) {
      if (result.error) errors.push(`${result.symbol}:${result.error}`);
      if (!result.securityId || !result.bars.length) continue;
      const payload = result.bars.map((bar) => ({
        id: randomUUID(),
        bar_time: `${bar.date}T00:00:00.000Z`,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }));
      const written = await sql`
        insert into historical_bars (id, security_id, timeframe, bar_time, open, high, low, close, volume, adjusted, source, payload)
        select id, ${result.securityId}, '1d', bar_time::timestamptz, open, high, low, close, volume, true, 'nasdaq-delayed', '{"evidenceClass":"delayed-reference"}'::jsonb
        from jsonb_to_recordset(convert_from(decode(${toJsonbBase64(payload)}, 'base64'), 'UTF8')::jsonb)
          as x(id text, bar_time text, open numeric, high numeric, low numeric, close numeric, volume numeric)
        on conflict (security_id, timeframe, bar_time, source) do update
          set open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close, volume = excluded.volume
        returning id
      `;
      inserted += written.length;
    }
  }
  return { ok: errors.length < wanted.length, inserted, requested: wanted.length, errors, capitalExecutionEnabled: false as const };
}
