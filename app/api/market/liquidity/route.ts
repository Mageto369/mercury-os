import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runLiquidityPulseWorkflow } from '@/lib/workflows/liquidity-pulse';

export const runtime = 'nodejs';

export async function GET() {
  if (!getDb()) {
    return NextResponse.json({ ok: true, persistent: false, snapshotsChecked: 0, signals: [], reason: 'database_not_configured' });
  }

  try {
    const result = await runLiquidityPulseWorkflow();
    return NextResponse.json({ ok: true, persistent: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'liquidity_pulse_failed', detail: error instanceof Error ? error.message : 'unknown liquidity error' }, { status: 500 });
  }
}
