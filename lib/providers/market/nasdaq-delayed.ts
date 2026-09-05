import type {
  MarketProvider,
  MarketProviderPullResult,
  NormalizedMarketSnapshot,
} from "@/lib/providers/market/types";

type NasdaqQuote = {
  data?: {
    symbol?: string;
    marketStatus?: string;
    primaryData?: {
      lastSalePrice?: string;
      lastTradeTimestamp?: string;
      volume?: string;
      isRealTime?: boolean;
    };
  };
};

function numberFromText(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function quoteTimestamp(value: string | undefined) {
  if (!value) return new Date(Number.NaN);
  const dateOnly = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(value.trim());
  return new Date(dateOnly ? `${value.trim()} 00:00:00 UTC` : value);
}

export function normalizeNasdaqDelayedSnapshot(
  requestedSymbol: string,
  body: NasdaqQuote,
): NormalizedMarketSnapshot | null {
  const quote = body.data?.primaryData;
  const price = numberFromText(quote?.lastSalePrice);
  const volume = numberFromText(quote?.volume);
  const observedAt = quoteTimestamp(quote?.lastTradeTimestamp);
  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(volume) ||
    volume < 0 ||
    Number.isNaN(observedAt.getTime())
  ) {
    return null;
  }
  const symbol = String(body.data?.symbol ?? requestedSymbol).toUpperCase();
  return {
    symbol,
    price,
    volume,
    dollarVolume: price * volume,
    observedAt,
    source: "nasdaq-delayed",
    isRealTime: false,
    providerPayload: {
      marketStatus: body.data?.marketStatus ?? null,
      isRealTime: quote?.isRealTime === true,
      evidenceClass: "delayed-reference",
    },
  };
}

export const nasdaqDelayedMarketProvider: MarketProvider = {
  name: "nasdaq-delayed",
  configured: async () => process.env.NASDAQ_DELAYED_ENABLED !== "0",
  async pull(symbols): Promise<MarketProviderPullResult> {
    const startedAt = new Date();
    const snapshots: NormalizedMarketSnapshot[] = [];
    const errors: Array<{ symbol?: string; message: string }> = [];
    const concurrency = Math.max(
      1,
      Math.min(8, Number(process.env.NASDAQ_DELAYED_CONCURRENCY ?? 4)),
    );
    let providerBlocked = false;

    for (let index = 0; index < symbols.length && !providerBlocked; index += concurrency) {
      const batch = symbols.slice(index, index + concurrency);
      const results = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8_000);
            const response = await fetch(
              `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=stocks`,
              {
                cache: "no-store",
                signal: controller.signal,
                redirect: "error",
                headers: {
                  accept: "application/json",
                  "user-agent": "MercuryOS/0.4 research-only market reference",
                },
              },
            );
            clearTimeout(timeout);
            if (response.status === 403 || response.status === 429) {
              providerBlocked = true;
              throw new Error(`http_${response.status}_circuit_open`);
            }
            if (!response.ok) throw new Error(`http_${response.status}`);
            const snapshot = normalizeNasdaqDelayedSnapshot(
              symbol,
              (await response.json()) as NasdaqQuote,
            );
            if (!snapshot) throw new Error("snapshot_unusable");
            return snapshot;
          } catch (error) {
            errors.push({
              symbol,
              message:
                error instanceof Error
                  ? error.message
                  : "nasdaq_delayed_pull_failed",
            });
            return null;
          }
        }),
      );
      for (const snapshot of results) if (snapshot) snapshots.push(snapshot);
    }

    return {
      provider: "nasdaq-delayed",
      ok: snapshots.length > 0,
      snapshots,
      requested: symbols.length,
      received: snapshots.length,
      errors,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    };
  },
};
