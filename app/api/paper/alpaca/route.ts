import { NextResponse } from 'next/server';
import { readAlpacaPaperAccount } from '@/lib/paper/alpaca-paper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await readAlpacaPaperAccount();
  const status = snapshot.status === 'refused' ? 400 : snapshot.status === 'unreachable' ? 502 : 200;
  return NextResponse.json(snapshot, { status });
}
