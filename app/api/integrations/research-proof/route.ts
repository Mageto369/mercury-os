import { NextResponse } from 'next/server';
import { bearerSecretMatches } from '@/lib/security/request-auth';
import { getResearchProofStatus, runResearchProofCycle } from '@/lib/integrations/research-proof';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(await getResearchProofStatus());
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !bearerSecretMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
  }
  const result = await runResearchProofCycle();
  const status = result.ok ? 202 : result.reason === 'database_not_configured' ? 503 : result.reason === 'research_proof_sidecar_not_configured' ? 424 : 422;
  return NextResponse.json(result, { status });
}
