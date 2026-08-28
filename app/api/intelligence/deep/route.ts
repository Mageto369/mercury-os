import { NextRequest, NextResponse } from 'next/server';import { bearerSecretMatches } from '@/lib/security/request-auth';
import { getDeepIntelligenceStatus, runDeepIntelligence } from '@/lib/intelligence/deep-intelligence';

export async function GET() { return NextResponse.json(await getDeepIntelligenceStatus()); }
export async function POST(request: NextRequest) {
  const secret=process.env.CRON_SECRET;
  if (!secret || !bearerSecretMatches(request.headers.get('authorization'), secret)) return NextResponse.json({error:'unauthorized'},{status:401});
  const result=await runDeepIntelligence();
  return NextResponse.json(result,{status:result.ok?202:503});
}
