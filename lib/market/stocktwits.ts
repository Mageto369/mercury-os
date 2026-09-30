export interface StocktwitsSnapshot {
  mentions: number;
  bullish: number;
  bearish: number;
  watchers: number;
}

interface StocktwitsMessage {
  entities?: { sentiment?: { basic?: string | null } | null } | null;
}

interface StocktwitsStream {
  symbol?: { watchlist_count?: number | null } | null;
  messages?: StocktwitsMessage[] | null;
}

function countSentiment(messages: StocktwitsMessage[]) {
  let bullish = 0;
  let bearish = 0;
  for (const message of messages) {
    const basic = message.entities?.sentiment?.basic;
    if (basic === "Bullish") bullish += 1;
    if (basic === "Bearish") bearish += 1;
  }
  return { bullish, bearish };
}

/** A symbol stream page. An empty page is an observed quiet tape. A bad payload is absent. */
export function parseStocktwitsStream(body: StocktwitsStream): StocktwitsSnapshot | null {
  if (!Array.isArray(body.messages)) return null;
  const sentiment = countSentiment(body.messages);
  const watchers = Number(body.symbol?.watchlist_count ?? 0);
  return {
    mentions: body.messages.length,
    bullish: sentiment.bullish,
    bearish: sentiment.bearish,
    watchers: Number.isFinite(watchers) && watchers > 0 ? watchers : 0,
  };
}

export async function fetchStocktwitsSnapshot(symbol: string) {
  const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      redirect: "error",
      headers: {
        accept: "application/json",
        "user-agent": "MercuryOS/0.4 research-only market reference",
      },
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return parseStocktwitsStream((await response.json()) as StocktwitsStream);
  } finally {
    clearTimeout(timeout);
  }
}
