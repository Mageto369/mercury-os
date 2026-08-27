import { NextResponse } from 'next/server';
import { getSourceReputation, refreshSourceReputation } from '@/lib/research/source-reputation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await getSourceReputation(Number(url.searchParams.get('limit') ?? 50));
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const result = await refreshSourceReputation();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
