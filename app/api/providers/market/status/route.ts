import { NextResponse } from 'next/server';
import { getMarketProviderStatus } from '@/lib/providers/market/router';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: 'shadow',
    capitalExecutionEnabled: false,
    ...getMarketProviderStatus(),
  });
}
