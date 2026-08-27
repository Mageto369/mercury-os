import { NextResponse } from 'next/server';
import { getKillSwitchNetwork } from '@/lib/risk/kill-switches';

export const runtime = 'nodejs';

export async function GET() {
  const result = await getKillSwitchNetwork();
  return NextResponse.json({ ok: true, ...result });
}
