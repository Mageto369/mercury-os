import { NextResponse } from 'next/server';
import { getHistoricalTwins } from '@/lib/research/historical-twins';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const opportunityId = url.searchParams.get('opportunityId');
  if (!opportunityId) return NextResponse.json({ ok: false, error: 'opportunityId_required' }, { status: 400 });
  const result = await getHistoricalTwins(opportunityId, Number(url.searchParams.get('limit') ?? 20));
  return NextResponse.json({ ok: true, ...result });
}
