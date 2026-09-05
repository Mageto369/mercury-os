import { resolveIntegrationSecret } from "@/lib/admin/vault";
import { isRuntimeIntegrationConfigured } from "@/lib/admin/integration-runtime";
import type {
  MarketProvider,
  MarketProviderPullResult,
  NormalizedMarketSnapshot,
} from "@/lib/providers/market/types";

type IntrinioRealtimeResponse = {
  security?: { code?: string; ticker?: string };
  last_price?: number;
  last_time?: string;
  bid_price?: number;
  ask_price?: number;
  exchange_volume?: number;
};

function spreadBps(bid?: number, ask?: number) {
  if (!bid || !ask || ask < bid) return undefined;
  const mid = (bid + ask) / 2;
  return mid > 0 ? Math.round(((ask - bid) / mid) * 10_000) : undefined;
}

export const intrinioMarketProvider: MarketProvider = {
  name: "intrinio",
  configured: () =>
    isRuntimeIntegrationConfigured("intrinio", ["INTRINIO_API_KEY"]),
  async pull(symbols): Promise<MarketProviderPullResult> {
    const startedAt = new Date();
    const key = await resolveIntegrationSecret("intrinio", [
      "INTRINIO_API_KEY",
    ]);
    if (!key)
      return {
        provider: "intrinio",
        ok: false,
        snapshots: [],
        requested: symbols.length,
        received: 0,
        errors: [{ message: "intrinio_api_key_not_configured" }],
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
      };

    const snapshots: NormalizedMarketSnapshot[] = [];
    const errors: Array<{ symbol?: string; message: string }> = [];
    const concurrency = Math.max(
      1,
      Math.min(15, Number(process.env.MARKET_PULL_CONCURRENCY ?? 6)),
    );

    for (let i = 0; i < symbols.length; i += concurrency) {
      const batch = symbols.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8_000);
            const response = await fetch(
              `https://api-v2.intrinio.com/securities/${encodeURIComponent(symbol)}/prices/realtime`,
              {
                cache: "no-store",
                signal: controller.signal,
                redirect: "error",
                headers: { Authorization: `Bearer ${key}` },
              },
            );
            clearTimeout(timeout);
            if (!response.ok) throw new Error(`http_${response.status}`);
            const data = (await response.json()) as IntrinioRealtimeResponse;
            const price = Number(data.last_price ?? 0);
            if (!Number.isFinite(price) || price <= 0)
              throw new Error("snapshot_unusable");
            const volume = Number(data.exchange_volume ?? 0);
            const bid = data.bid_price;
            const ask = data.ask_price;
            return {
              symbol,
              price,
              volume: Number.isFinite(volume) ? volume : 0,
              dollarVolume: Number.isFinite(volume) ? volume * price : 0,
              bid,
              ask,
              spreadBps: spreadBps(bid, ask),
              observedAt: data.last_time
                ? new Date(data.last_time)
                : new Date(),
              source: "intrinio" as const,
              providerPayload: {},
            } satisfies NormalizedMarketSnapshot;
          } catch (error) {
            errors.push({
              symbol,
              message:
                error instanceof Error ? error.message : "intrinio_pull_failed",
            });
            return null;
          }
        }),
      );
      for (const item of results) if (item) snapshots.push(item);
    }

    return {
      provider: "intrinio",
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
