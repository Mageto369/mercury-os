import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { bearerSecretMatches } from '@/lib/security/request-auth';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { securities, shareStructures } from '@/lib/db/schema';

export const runtime = 'nodejs';

const structureSchema = z.object({
  symbol: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()),
  authorizedShares: z.number().int().nonnegative().optional(),
  outstandingShares: z.number().int().nonnegative().optional(),
  floatShares: z.number().int().nonnegative().optional(),
  verified: z.boolean().default(false),
  source: z.string().trim().min(1).max(100),
  observedAt: z.string().datetime(),
}).refine((value) => value.authorizedShares !== undefined || value.outstandingShares !== undefined || value.floatShares !== undefined, {
  message: 'At least one share structure value is required',
});

const bodySchema = z.object({ structures: z.array(structureSchema).min(1).max(500) });

export async function POST(request: Request) {
  const secret = process.env.STRUCTURE_INGEST_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'structure_ingest_secret_not_configured' }, { status: 503 });
  if (!bearerSecretMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_structure_payload', issues: parsed.error.issues }, { status: 400 });

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, error: 'database_not_configured' }, { status: 503 });

  let inserted = 0;
  const unknownSymbols = new Set<string>();

  for (const input of parsed.data.structures) {
    const [security] = await db.select({ id: securities.id }).from(securities).where(eq(securities.symbol, input.symbol)).limit(1);
    if (!security) {
      unknownSymbols.add(input.symbol);
      continue;
    }

    await db.insert(shareStructures).values({
      id: randomUUID(),
      securityId: security.id,
      authorizedShares: input.authorizedShares === undefined ? null : String(input.authorizedShares),
      outstandingShares: input.outstandingShares === undefined ? null : String(input.outstandingShares),
      floatShares: input.floatShares === undefined ? null : String(input.floatShares),
      verified: input.verified,
      source: input.source,
      observedAt: new Date(input.observedAt),
    });
    inserted += 1;
  }

  return NextResponse.json({ ok: true, inserted, rejectedUnknownSymbols: [...unknownSymbols] }, { status: 202 });
}
