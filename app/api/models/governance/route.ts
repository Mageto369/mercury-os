import { NextResponse } from 'next/server';
import { getModelGovernance } from '@/lib/models/governance';

export const runtime = 'nodejs';

export async function GET() {
  const result = await getModelGovernance();
  return NextResponse.json({ ok: true, ...result });
}
