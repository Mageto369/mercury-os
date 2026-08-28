import { NextResponse } from 'next/server';
import { bearerSecretMatches } from '@/lib/security/request-auth';
import { buildShadowPortfolio, getLatestShadowPortfolio } from '@/lib/portfolio/shadow-portfolio';

export const runtime = 'nodejs';

export async function GET() {
  const result = await getLatestShadowPortfolio();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || !bearerSecretMatches(auth, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const result = await buildShadowPortfolio();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
