import { NextResponse } from 'next/server';
import { bearerSecretMatches } from '@/lib/security/request-auth';
import { runOpenDataMesh } from '@/lib/providers/open-data/mesh';
export const runtime='nodejs';
export async function POST(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret) return NextResponse.json({ok:false,error:'cron_secret_not_configured'},{status:503});
  if(!bearerSecretMatches(request.headers.get('authorization'), secret)) return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  const result=await runOpenDataMesh();
  return NextResponse.json(result,{status:result.ok?202:503});
}
