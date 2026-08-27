import { randomUUID } from 'node:crypto';
import { asc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { securities } from '@/lib/db/schema';

export const runtime = 'nodejs';

const securitySchema = z.object({
  symbol: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()),
  name: z.string().trim().max(200).optional(),
  market: z.enum(['OTC', 'NASDAQ', 'NYSE', 'AMEX']),
  cik: z.string().trim().regex(/^\d{1,10}$/).optional(),
});

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: true, persistent: false, securities: [], reason: 'database_not_configured' });
  }

  const rows = await db
    .select()
    .from(securities)
    .orderBy(asc(securities.symbol));

  return NextResponse.json({ ok: true, persistent: true, securities: rows, count: rows.length });
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const parsed = securitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_security', issues: parsed.error.issues }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: 'database_not_configured' }, { status: 503 });
  }

  const input = parsed.data;
  const normalizedCik = input.cik ? input.cik.padStart(10, '0') : null;
  const result = await db
    .insert(securities)
    .values({
      id: randomUUID(),
      symbol: input.symbol,
      name: input.name ?? null,
      market: input.market,
      cik: normalizedCik,
      active: true,
    })
    .onConflictDoUpdate({
      target: securities.symbol,
      set: {
        name: input.name ?? null,
        market: input.market,
        cik: normalizedCik,
        active: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ ok: true, security: result[0] }, { status: 201 });
}
