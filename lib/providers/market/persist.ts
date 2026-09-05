import { randomUUID } from 'node:crypto';
import type { getSql } from '@/lib/db';
import { toJsonbBase64 } from '@/lib/db/json';
import type { NormalizedMarketSnapshot } from './types';

// JSON transport avoids Date/type inference differences in production bundles.
// One INSERT also prevents a partially written provider batch.
export async function persistMarketSnapshots(
  sql: NonNullable<ReturnType<typeof getSql>>,
  snapshots: NormalizedMarketSnapshot[],
  securityIds: Map<string, string>,
  floats: Map<string, number>,
) {
  const ingestedAt = new Date().toISOString();
  const records = snapshots.flatMap(snapshot => {
    const securityId = securityIds.get(snapshot.symbol);
    if (!securityId) return [];
    const floatShares = floats.get(securityId) ?? 0;
    return [{
      id: randomUUID(), security_id: securityId,
      price: snapshot.price, volume: Math.round(snapshot.volume),
      dollar_volume: snapshot.dollarVolume, bid: snapshot.bid ?? null,
      ask: snapshot.ask ?? null, spread_bps: snapshot.spreadBps ?? null,
      rvol: snapshot.rvol ?? null,
      float_rotation: floatShares > 0 ? snapshot.volume / floatShares : null,
      observed_at: snapshot.observedAt.toISOString(),
      payload: {
        source: snapshot.source, provider: snapshot.providerPayload ?? {},
        livePull: snapshot.isRealTime,
        evidenceClass: snapshot.isRealTime ? 'live' : 'delayed-reference',
        ingestedAt,
      },
    }];
  });
  if (!records.length) return 0;
  const inserted = await sql`
    INSERT INTO market_snapshots
      (id,security_id,price,volume,dollar_volume,bid,ask,spread_bps,rvol,float_rotation,payload,observed_at)
    SELECT input.id,input.security_id,input.price,input.volume,input.dollar_volume,
      input.bid,input.ask,input.spread_bps,input.rvol,input.float_rotation,input.payload,input.observed_at
    FROM jsonb_to_recordset(convert_from(decode(${toJsonbBase64(records)},'base64'),'utf8')::jsonb)
      AS input(id text,security_id text,price numeric,volume numeric,dollar_volume numeric,
        bid numeric,ask numeric,spread_bps integer,rvol numeric,float_rotation numeric,
        payload jsonb,observed_at timestamptz)
    WHERE NOT EXISTS (
      SELECT 1 FROM market_snapshots existing
      WHERE existing.security_id=input.security_id AND existing.observed_at=input.observed_at
        AND existing.payload->>'source'=input.payload->>'source'
    ) RETURNING id`;
  return inserted.length;
}
