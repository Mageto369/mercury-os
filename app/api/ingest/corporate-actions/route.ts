import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { corporateActions, securities } from '@/lib/db/schema';

export const runtime = 'nodejs';

const actionSchema = z.object({
  symbol: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()),
  type: z.enum(['reverse_split', 'forward_split', 'symbol_change', 'name_change', 'merger', 'spinoff', 'dividend', 'other']),
  riskScore: z.number().int().min(0).max(100),
  effectiveDate: z.string().datetime().optional(),
  observedAt: z.string().datetime(),
  source: z.string().trim().min(1).max(100),
  detail: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.object({ actions: z.array(actionSchema).min(1).max(500) });

export async function POST(request: Request) {
  const secret = process.env.CORPORATE_ACTION_INGEST_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'corporate_action_ingest_secret_not_configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_corporate_action_payload', issues: parsed.error.issues }, { status: 400 });

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, error: 'database_not_configured' }, { status: 503 });

  let inserted = 0;
  const unknownSymbols = new Set<string>();

  for (const input of parsed.data.actions) {
    const [security] = await db.select({ id: securities.id }).from(securities).where(eq(securities.symbol, input.symbol)).limit(1);
    if (!security) {
      unknownSymbols.add(input.symbol);
      continue;
    }

    await db.insert(corporateActions).values({
      id: randomUUID(),
      securityId: security.id,
      type: input.type,
      effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
      riskScore: input.riskScore,
      payload: { source: input.source, detail: input.detail ?? {} },
      observedAt: new Date(input.observedAt),
    });
    inserted += 1;
  }

  return NextResponse.json({ ok: true, inserted, rejectedUnknownSymbols: [...unknownSymbols] }, { status: 202 });
}
