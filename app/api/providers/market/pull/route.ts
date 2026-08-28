import { NextResponse } from 'next/server';import { bearerSecretMatches } from '@/lib/security/request-auth';
import { pullAndPersistMarketData } from '@/lib/providers/market/router';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || !bearerSecretMatches(auth, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const result = await pullAndPersistMarketData();
  if (!result.ok) return NextResponse.json(result, { status: result.reason === 'database_not_configured' ? 503 : 424 });
  return NextResponse.json(result, { status: 202 });
}
