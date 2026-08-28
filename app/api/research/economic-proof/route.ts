import { NextRequest, NextResponse } from 'next/server';
import { bearerSecretMatches } from '@/lib/security/request-auth';
import { evaluateEconomicProof } from '@/lib/intelligence/economic-proof';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !bearerSecretMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await evaluateEconomicProof();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
