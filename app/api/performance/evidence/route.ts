import { NextResponse } from 'next/server';
import { getOutcomeEvidence, matureOpportunityOutcomes } from '@/lib/performance/outcomes';

export const runtime = 'nodejs';

export async function GET() {
  const evidence = await getOutcomeEvidence();
  return NextResponse.json({ ok: true, ...evidence });
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const result = await matureOpportunityOutcomes();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
