import { NextResponse } from 'next/server';
import { getShadowPerformance } from '@/lib/performance/shadow';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(await getShadowPerformance());
}
