import { NextResponse } from 'next/server';
import { getProductionReadiness } from '@/lib/activation/readiness';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(await getProductionReadiness());
}
