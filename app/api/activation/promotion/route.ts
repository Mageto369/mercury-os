import { NextResponse } from 'next/server';
import { evaluateShadowPromotion } from '@/lib/activation/promotion';

export const runtime = 'nodejs';

export async function GET() {
  const result = await evaluateShadowPromotion();
  return NextResponse.json(result);
}
