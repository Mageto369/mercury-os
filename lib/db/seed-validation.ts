import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { marketSnapshots, securities, shareStructures, socialMentions } from '@/lib/db/schema';

const validationUniverse = [
  { symbol: 'IOND', name: 'Ion Defense Validation', market: 'OTC' },
  { symbol: 'VRTX', name: 'Vertex Robotics Validation', market: 'OTC' },
  { symbol: 'NOVA', name: 'Nova Biomed Validation', market: 'OTC' },
  { symbol: 'CRBN', name: 'Carbon Ridge Validation', market: 'OTC' },
  { symbol: 'AXIS', name: 'Axis Quantum Validation', market: 'OTC' },
  { symbol: 'DRNX', name: 'DroneX Validation', market: 'OTC' },
];

export async function seedValidationUniverse() {
  const db = getDb();
  if (!db) return { ok: false as const, reason: 'database_not_configured' as const };

  for (const item of validationUniverse) {
    await db.insert(securities).values({
      id: `validation:${item.symbol}`,
      symbol: item.symbol,
      name: item.name,
      market: item.market,
      active: true,
    }).onConflictDoUpdate({
      target: securities.symbol,
      set: { name: item.name, market: item.market, active: true, updatedAt: new Date() },
    });
  }

  const securityRows = await db.select().from(securities).where(inArray(securities.symbol, validationUniverse.map((item) => item.symbol)));
  const bySymbol = new Map(securityRows.map((row) => [row.symbol, row]));
  const now = Date.now();
  let marketInserted = 0;
  let socialInserted = 0;
  let structuresInserted = 0;

  for (let symbolIndex = 0; symbolIndex < validationUniverse.length; symbolIndex += 1) {
    const item = validationUniverse[symbolIndex];
    const security = bySymbol.get(item.symbol);
    if (!security) continue;

    const basePrice = 0.025 + symbolIndex * 0.012;
    for (let step = 0; step < 12; step += 1) {
      const observedAt = new Date(now - (11 - step) * 60_000);
      const acceleration = Math.max(0, step - 5) * (0.018 + symbolIndex * 0.002);
      const price = basePrice * (1 + step * 0.012 + acceleration);
      const volume = 120_000 + step * 48_000 + symbolIndex * 22_000;
      const spreadBps = Math.max(35, 260 - step * 16 - symbolIndex * 9);
      const rvol = 1.1 + step * 0.52 + symbolIndex * 0.18;
      const rotation = 0.08 + step * 0.11 + symbolIndex * 0.04;
      const id = `validation:market:${item.symbol}:${step}`;

      await db.insert(marketSnapshots).values({
        id,
        securityId: security.id,
        price: price.toFixed(8),
        volume: String(volume),
        dollarVolume: (price * volume).toFixed(2),
        bid: (price * (1 - spreadBps / 20_000)).toFixed(8),
        ask: (price * (1 + spreadBps / 20_000)).toFixed(8),
        spreadBps,
        rvol: rvol.toFixed(3),
        floatRotation: rotation.toFixed(3),
        payload: { synthetic: true, validationDataset: 'mercury-v1', step },
        observedAt,
      }).onConflictDoUpdate({
        target: marketSnapshots.id,
        set: {
          price: price.toFixed(8), volume: String(volume), dollarVolume: (price * volume).toFixed(2),
          spreadBps, rvol: rvol.toFixed(3), floatRotation: rotation.toFixed(3), observedAt,
          payload: { synthetic: true, validationDataset: 'mercury-v1', step },
        },
      });
      marketInserted += 1;
    }

    for (const [sourceIndex, source] of ['reddit', 'discord', 'telegram', 'facebook'].entries()) {
      const id = `validation:social:${item.symbol}:${source}`;
      await db.insert(socialMentions).values({
        id,
        securityId: security.id,
        source,
        sourceRef: `validation-${source}`,
        sentiment: 55 + symbolIndex * 4 + sourceIndex * 2,
        promotionRisk: Math.min(78, 12 + symbolIndex * 7 + sourceIndex * 5),
        engagement: 130 + symbolIndex * 85 + sourceIndex * 60,
        payload: {
          synthetic: true,
          validationDataset: 'mercury-v1',
          mentions: 18 + symbolIndex * 9 + sourceIndex * 6,
          velocity: 45 + symbolIndex * 7 + sourceIndex * 4,
          crowding: 22 + symbolIndex * 6 + sourceIndex * 5,
        },
        observedAt: new Date(now - sourceIndex * 90_000),
      }).onConflictDoUpdate({
        target: socialMentions.id,
        set: {
          sentiment: 55 + symbolIndex * 4 + sourceIndex * 2,
          promotionRisk: Math.min(78, 12 + symbolIndex * 7 + sourceIndex * 5),
          engagement: 130 + symbolIndex * 85 + sourceIndex * 60,
          observedAt: new Date(now - sourceIndex * 90_000),
          payload: {
            synthetic: true, validationDataset: 'mercury-v1', mentions: 18 + symbolIndex * 9 + sourceIndex * 6,
            velocity: 45 + symbolIndex * 7 + sourceIndex * 4, crowding: 22 + symbolIndex * 6 + sourceIndex * 5,
          },
        },
      });
      socialInserted += 1;
    }

    await db.insert(shareStructures).values({
      id: `validation:structure:${item.symbol}`,
      securityId: security.id,
      authorizedShares: String(250_000_000 + symbolIndex * 25_000_000),
      outstandingShares: String(32_000_000 + symbolIndex * 4_000_000),
      floatShares: String(12_000_000 + symbolIndex * 2_000_000),
      verified: true,
      source: 'synthetic-validation',
      observedAt: new Date(now - 5 * 60_000),
    }).onConflictDoUpdate({
      target: shareStructures.id,
      set: { observedAt: new Date(now - 5 * 60_000), verified: true, source: 'synthetic-validation' },
    });
    structuresInserted += 1;
  }

  const validationCount = await db.select({ id: securities.id }).from(securities).where(eq(securities.market, 'OTC'));

  return {
    ok: true as const,
    dataset: 'mercury-v1',
    synthetic: true,
    securities: validationUniverse.length,
    marketSnapshots: marketInserted,
    socialSignals: socialInserted,
    shareStructures: structuresInserted,
    trackedUniverseCount: validationCount.length,
    seededAt: new Date().toISOString(),
  };
}
