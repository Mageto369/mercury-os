import { NextResponse } from 'next/server';import { bearerSecretMatches } from '@/lib/security/request-auth';
import { getOpenIntelligenceStatus, runOpenIntelligenceSync } from '@/lib/integrations/open-intelligence-sync';

export const runtime='nodejs';

export async function GET(){
  return NextResponse.json(await getOpenIntelligenceStatus());
}

export async function POST(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret || !bearerSecretMatches(request.headers.get('authorization'), secret))
    return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  const result=await runOpenIntelligenceSync();
  const status=result.ok ? 202 : result.reason==='database_not_configured' ? 503 : 424;
  return NextResponse.json(result,{status});
}
