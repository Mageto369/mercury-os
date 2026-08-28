import { NextResponse } from 'next/server';
import { adminConfigured, adminCookie, adminSessionValue, adminAuthorized, clearAdminCookie, sameOriginMutation, verifyAdminToken } from '@/lib/admin/security';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request: Request) {
  return NextResponse.json({ ok:true, configured:adminConfigured(), authenticated:adminAuthorized(request) });
}

export async function POST(request: Request) {
  if (!sameOriginMutation(request)) return NextResponse.json({ok:false,error:'forbidden_origin'},{status:403});
  if (!adminConfigured()) return NextResponse.json({ok:false,error:'admin_not_configured'},{status:503});
  const body=await request.json().catch(()=>null) as {token?:string}|null;
  if (!verifyAdminToken(body?.token)) return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  const response=NextResponse.json({ok:true,authenticated:true});
  response.headers.set('set-cookie',adminCookie(adminSessionValue()));
  return response;
}

export async function DELETE(request: Request) {
  if (!sameOriginMutation(request)) return NextResponse.json({ok:false,error:'forbidden_origin'},{status:403});
  const response=NextResponse.json({ok:true,authenticated:false});
  response.headers.set('set-cookie',clearAdminCookie());
  return response;
}
