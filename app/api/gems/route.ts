import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runGemDiscoveryWorkflow } from '@/lib/workflows/gem-discovery';

export const runtime = 'nodejs';

export async function GET() {
  if (!getDb()) {
    return NextResponse.json({ ok: true, persistent: false, candidates: [], universeSize: 0, reason: 'database_not_configured' });
  }
  try {
    const result = await runGemDiscoveryWorkflow();
    return NextResponse.json({ ok: true, persistent: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'gem_discovery_failed', detail: error instanceof Error ? error.message : 'unknown gem discovery error' }, { status: 500 });
  }
}
