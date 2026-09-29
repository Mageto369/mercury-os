import { getSql } from "@/lib/db";
import { loadPricePush } from "@/lib/market/attention";
import { rankDailyConsiderations } from "@/lib/market/daily-rank";
import { loadDailyHistory } from "@/lib/market/daily-history";
import { collectForwardAnalogs, summarizePriceHistory } from "@/lib/market/nasdaq-history";
import { applyPricePush, EMPTY_PRICE_PUSH } from "@/lib/market/price-push";
import { PENNY_MAX_PRICE, PENNY_MAX_SPREAD_BPS, PENNY_MIN_DOLLAR_VOLUME } from "@/lib/workflows/penny-screen";

/** Average 5-session result for the requested symbols, using the penny book's similar sessions. */
export async function loadPennyExpectancy(symbols: string[]) {
  const wanted = new Set(symbols.map((symbol) => symbol.toUpperCase()).filter(Boolean));
  const expectancy = new Map<string, number | null>();
  for (const symbol of wanted) expectancy.set(symbol, null);
  if (!wanted.size) return expectancy;
  const sql = getSql();
  if (!sql) return expectancy;
  const rows = await sql<{ symbol: string; price: number }[]>`
    select distinct on (m.security_id) s.symbol, m.price::float as price
    from market_snapshots m
    join securities s on s.id = m.security_id
    where s.active = true and s.id not like 'validation:%'
      and m.price > 0 and m.price < ${PENNY_MAX_PRICE}
      and m.dollar_volume >= ${PENNY_MIN_DOLLAR_VOLUME}
      and (m.spread_bps is null or m.spread_bps <= ${PENNY_MAX_SPREAD_BPS})
      and s.symbol !~ '[.+^/]'
      and s.symbol !~ '(WS|WW)$'
    order by m.security_id, m.observed_at desc
  `;
  const quotes = rows.map((row) => ({ symbol: String(row.symbol).toUpperCase(), price: Number(row.price) }));
  const bookSymbols = [...new Set(quotes.map((quote) => quote.symbol))];
  const [histories, pushes] = await Promise.all([
    loadDailyHistory(bookSymbols, 90),
    loadPricePush(bookSymbols),
  ]);
  const analogs = bookSymbols.flatMap((symbol) => collectForwardAnalogs(symbol, histories.get(symbol) ?? []));
  const candidates = quotes.flatMap((quote) => {
    const history = summarizePriceHistory(quote.price, histories.get(quote.symbol) ?? []);
    const push = pushes.get(quote.symbol) ?? EMPTY_PRICE_PUSH;
    const rise = applyPricePush(history.rise, push);
    if (
      history.return5Pct == null
      || history.relativeVolume == null
      || history.extension20Pct == null
      || history.closeLocationPct == null
      || rise.score == null
    ) return [];
    return [{
      symbol: quote.symbol,
      asOf: history.sessions[0]?.date ?? "",
      blocksRoom: push.blocksRoom,
      socialHype: push.socialHype,
      setup: {
        return5Pct: history.return5Pct,
        relativeVolume: history.relativeVolume,
        extension20Pct: history.extension20Pct,
        closeLocationPct: history.closeLocationPct,
        room: rise.room,
        riseScore: rise.score,
      },
    }];
  });
  const rank = rankDailyConsiderations(candidates, analogs);
  for (const row of rank.considered) {
    if (wanted.has(row.symbol)) expectancy.set(row.symbol, row.expectancyPct);
  }
  return expectancy;
}
