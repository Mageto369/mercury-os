import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { systemEvents } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({
      ok: true,
      persistent: false,
      events: [],
      reason: 'database_not_configured',
    });
  }

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('limit') ?? 25);
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 25));

  const events = await db
    .select()
    .from(systemEvents)
    .orderBy(desc(systemEvents.observedAt))
    .limit(limit);

  return NextResponse.json({
    ok: true,
    persistent: true,
    events,
    count: events.length,
  });
}
