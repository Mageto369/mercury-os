import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { securities, socialMentions } from '@/lib/db/schema';

export const runtime = 'nodejs';

const signalSchema = z.object({
  symbol: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()),
  source: z.enum(['reddit', 'discord', 'telegram', 'facebook']),
  mentions: z.number().int().min(0).max(1_000_000),
  velocity: z.number().min(0).max(100),
  sentiment: z.number().min(-100).max(100),
  promotionRisk: z.number().min(0).max(100),
  crowding: z.number().min(0).max(100),
  observedAt: z.string().datetime(),
  sourceRef: z.string().max(500).optional(),
});

const bodySchema = z.object({ signals: z.array(signalSchema).min(1).max(500) });

export async function POST(request: Request) {
  const secret = process.env.SOCIAL_INGEST_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'social_ingest_secret_not_configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_social_payload', issues: parsed.error.issues }, { status: 400 });
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

    await db.insert(socialMentions).values({
      id: randomUUID(),
      securityId: security.id,
      source: signal.source,
      sourceRef: signal.sourceRef ?? null,
      sentiment: Math.round(signal.sentiment),
      promotionRisk: Math.round(signal.promotionRisk),
      engagement: signal.mentions,
      payload: {
        mentions: signal.mentions,
        velocity: signal.velocity,
        crowding: signal.crowding,
      },
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
