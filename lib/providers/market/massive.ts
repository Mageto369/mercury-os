import { resolveIntegrationSecret } from "@/lib/admin/vault";
import { isRuntimeIntegrationConfigured } from "@/lib/admin/integration-runtime";
import type {
  MarketProvider,
  MarketProviderPullResult,
  NormalizedMarketSnapshot,
} from "@/lib/providers/market/types";

type MassiveSnapshotResponse = {
  status?: string;
  ticker?: {
    ticker?: string;
    day?: { c?: number; v?: number; vw?: number };
    min?: { c?: number; v?: number; vw?: number; t?: number };
    latestTrade?: { p?: number; t?: number };
    latestQuote?: { p?: number; P?: number; t?: number };
    prevDay?: { c?: number; v?: number };
  };
};

function spreadBps(bid?: number, ask?: number) {
  if (!bid || !ask || ask < bid) return undefined;
  const mid = (bid + ask) / 2;
  return mid > 0 ? Math.round(((ask - bid) / mid) * 10_000) : undefined;
}

function normalize(
  symbol: string,
  data: MassiveSnapshotResponse,
): NormalizedMarketSnapshot | null {
  const ticker = data.ticker;
  if (!ticker) return null;
  const price = ticker.latestTrade?.p ?? ticker.min?.c ?? ticker.day?.c;
  if (!price || price <= 0) return null;
  const volume = ticker.day?.v ?? ticker.min?.v ?? 0;
  const bid = ticker.latestQuote?.p;
  const ask = ticker.latestQuote?.P;
  const observedMs =
    ticker.latestTrade?.t ??
    ticker.latestQuote?.t ??
    ticker.min?.t ??
    Date.now();
  return {
    symbol,
    price,
    volume,
    dollarVolume: volume * price,
    bid,
    ask,
    spreadBps: spreadBps(bid, ask),
    observedAt: new Date(
      observedMs > 10_000_000_000_000
        ? Math.floor(observedMs / 1_000_000)
        : observedMs,
    ),
    source: "massive",
    isRealTime: true,
    providerPayload: {
      minuteVwap: ticker.min?.vw,
      dayVwap: ticker.day?.vw,
      previousClose: ticker.prevDay?.c,
      previousVolume: ticker.prevDay?.v,
    },
  };
}

export const massiveMarketProvider: MarketProvider = {
  name: "massive",
  configured: () =>
    isRuntimeIntegrationConfigured("massive", [
      "MASSIVE_API_KEY",
      "MARKET_DATA_API_KEY",
    ]),
  async pull(symbols): Promise<MarketProviderPullResult> {
    const startedAt = new Date();
    const key = await resolveIntegrationSecret("massive", [
      "MASSIVE_API_KEY",
      "MARKET_DATA_API_KEY",
    ]);
    if (!key)
      return {
        provider: "massive",
        ok: false,
        snapshots: [],
        requested: symbols.length,
        received: 0,
        errors: [{ message: "massive_api_key_not_configured" }],
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
      };

    const snapshots: NormalizedMarketSnapshot[] = [];
    const errors: Array<{ symbol?: string; message: string }> = [];
    const concurrency = Math.max(
      1,
      Math.min(20, Number(process.env.MARKET_PULL_CONCURRENCY ?? 8)),
    );

    for (let i = 0; i < symbols.length; i += concurrency) {
      const batch = symbols.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8_000);
            const response = await fetch(
              `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${encodeURIComponent(key)}`,
              {
                cache: "no-store",
                signal: controller.signal,
                redirect: "error",
              },
            );
            clearTimeout(timeout);
            if (!response.ok) throw new Error(`http_${response.status}`);
            const data = (await response.json()) as MassiveSnapshotResponse;
            const snapshot = normalize(symbol, data);
            if (!snapshot) throw new Error("snapshot_unusable");
            return snapshot;
          } catch (error) {
            errors.push({
              symbol,
              message:
                error instanceof Error ? error.message : "massive_pull_failed",
            });
            return null;
          }
        }),
      );
      for (const item of results) if (item) snapshots.push(item);
    }

    return {
      provider: "massive",
      ok: snapshots.length > 0 && errors.length < symbols.length,
      snapshots,
      requested: symbols.length,
      received: snapshots.length,
      errors,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    };
  },
};
