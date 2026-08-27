import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runMarketRegimeWorkflow } from '@/lib/workflows/market-regime';

export const runtime = 'nodejs';

export async function GET() {
  if (!getDb()) {
    return NextResponse.json({ ok: true, persistent: false, snapshotsChecked: 0, regime: null, reason: 'database_not_configured' });
  }

  try {
    const result = await runMarketRegimeWorkflow();
    return NextResponse.json({ ok: true, persistent: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'market_regime_failed', detail: error instanceof Error ? error.message : 'unknown market regime error' }, { status: 500 });
  }
}
