import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';import { bearerSecretMatches } from '@/lib/security/request-auth';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { marketSnapshots, securities } from '@/lib/db/schema';

export const runtime = 'nodejs';

const signalSchema = z.object({
  symbol: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()),
  price: z.number().positive(),
  volume: z.number().nonnegative(),
  dollarVolume: z.number().nonnegative(),
  bid: z.number().positive().optional(),
  ask: z.number().positive().optional(),
  spreadBps: z.number().int().min(0).max(100_000).optional(),
  rvol: z.number().min(0).max(1000).optional(),
  floatRotation: z.number().min(0).max(1000).optional(),
  observedAt: z.string().datetime(),
  source: z.string().trim().min(1).max(80).default('normalized-market-feed'),
});

const bodySchema = z.object({ signals: z.array(signalSchema).min(1).max(1000) });

export async function POST(request: Request) {
  const secret = process.env.MARKET_INGEST_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'market_ingest_secret_not_configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (!bearerSecretMatches(auth, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_market_payload', issues: parsed.error.issues }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: 'database_not_configured' }, { status: 503 });
  }

  let inserted = 0;
  const unknownSymbols = new Set<string>();

  for (const signal of parsed.data.signals) {
    const [security] = await db
      .select({ id: securities.id })
      .from(securities)
      .where(eq(securities.symbol, signal.symbol))
      .limit(1);

    if (!security) {
      unknownSymbols.add(signal.symbol);
      continue;
    }

    const spreadBps = signal.spreadBps ?? (
      signal.bid && signal.ask && signal.ask >= signal.bid
        ? Math.round(((signal.ask - signal.bid) / ((signal.ask + signal.bid) / 2)) * 10_000)
        : null
    );

    await db.insert(marketSnapshots).values({
      id: randomUUID(),
      securityId: security.id,
      price: String(signal.price),
      volume: String(Math.round(signal.volume)),
      dollarVolume: String(signal.dollarVolume),
      bid: signal.bid ? String(signal.bid) : null,
      ask: signal.ask ? String(signal.ask) : null,
      spreadBps,
      rvol: signal.rvol === undefined ? null : String(signal.rvol),
      floatRotation: signal.floatRotation === undefined ? null : String(signal.floatRotation),
      payload: { source: signal.source },
      observedAt: new Date(signal.observedAt),
    });
    inserted += 1;
  }

  return NextResponse.json({
    ok: true,
    inserted,
    rejectedUnknownSymbols: [...unknownSymbols],
  }, { status: 202 });
}
