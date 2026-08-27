import { randomUUID } from 'node:crypto';
import { getSql } from '@/lib/db';
import { intrinioMarketProvider } from '@/lib/providers/market/intrinio';
import { massiveMarketProvider } from '@/lib/providers/market/massive';
import type { MarketProvider, MarketProviderName, MarketProviderPullResult } from '@/lib/providers/market/types';

const providers: Record<MarketProviderName, MarketProvider> = {
  massive: massiveMarketProvider,
  intrinio: intrinioMarketProvider,
};

function selectedProviders(): MarketProvider[] {
  const configuredMode = (process.env.MARKET_DATA_PROVIDER ?? 'auto').toLowerCase();
  if (configuredMode === 'massive') return [providers.massive];
  if (configuredMode === 'intrinio') return [providers.intrinio];
  return [providers.massive, providers.intrinio];
}

export function getMarketProviderStatus() {
  return {
    mode: process.env.MARKET_DATA_PROVIDER ?? 'auto',
    providers: Object.values(providers).map((provider) => ({ name: provider.name, configured: provider.configured() })),
    preferred: selectedProviders().map((provider) => provider.name),
  };
}

export async function pullAndPersistMarketData() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const, attempts: [] as MarketProviderPullResult[] };

  const maxSymbols = Math.max(1, Math.min(5000, Number(process.env.MARKET_PULL_MAX_SYMBOLS ?? 750)));
  const universe = await sql`SELECT id, symbol FROM securities WHERE active = true ORDER BY symbol LIMIT ${maxSymbols}`;
  const symbols = universe.map((row) => String(row.symbol));
  if (!symbols.length) return { ok: false as const, reason: 'universe_empty' as const, attempts: [] as MarketProviderPullResult[] };

  const securityIds = new Map(universe.map((row) => [String(row.symbol), String(row.id)]));
  const attempts: MarketProviderPullResult[] = [];
  let winner: MarketProviderPullResult | null = null;

  for (const provider of selectedProviders()) {
    if (!provider.configured()) continue;
    const result = await provider.pull(symbols);
    attempts.push(result);
    if (result.ok && result.snapshots.length) {
      winner = result;
      break;
    }
  }

  if (!winner) {
    return {
      ok: false as const,
      reason: attempts.length ? 'all_market_providers_failed' as const : 'market_provider_not_configured' as const,
      attempts,
    };
  }

  const structures = await sql`
    SELECT DISTINCT ON (security_id) security_id, float_shares
    FROM share_structures
    WHERE security_id = ANY(${sql.array([...securityIds.values()])})
    ORDER BY security_id, observed_at DESC
  `;
  const floats = new Map(structures.map((row) => [String(row.security_id), Number(row.float_shares ?? 0)]));

  let inserted = 0;
  for (const snapshot of winner.snapshots) {
    const securityId = securityIds.get(snapshot.symbol);
    if (!securityId) continue;
    const floatShares = floats.get(securityId) ?? 0;
    const floatRotation = floatShares > 0 ? snapshot.volume / floatShares : null;
    await sql`
      INSERT INTO market_snapshots (
        id, security_id, price, volume, dollar_volume, bid, ask, spread_bps, rvol, float_rotation, payload, observed_at
      ) VALUES (
        ${randomUUID()}, ${securityId}, ${snapshot.price}, ${Math.round(snapshot.volume)}, ${snapshot.dollarVolume},
        ${snapshot.bid ?? null}, ${snapshot.ask ?? null}, ${snapshot.spreadBps ?? null}, ${snapshot.rvol ?? null},
        ${floatRotation}, ${sql.json({ source: snapshot.source, provider: snapshot.providerPayload ?? {}, livePull: true })}, ${snapshot.observedAt}
      )
    `;
    inserted += 1;
  }

  return {
    ok: true as const,
    provider: winner.provider,
    inserted,
    requested: symbols.length,
    received: winner.received,
    errors: winner.errors,
    attempts,
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
    completedAt: new Date().toISOString(),
  };
}
