import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runSocialRadarWorkflow } from '@/lib/workflows/social-radar';

export const runtime = 'nodejs';

export async function GET() {
  if (!getDb()) {
    return NextResponse.json({
      ok: true,
      persistent: false,
      signalsChecked: 0,
      trends: [],
      reason: 'database_not_configured',
    });
  }

  try {
    const result = await runSocialRadarWorkflow();
    return NextResponse.json({ ok: true, persistent: true, ...result });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: 'social_radar_failed',
      detail: error instanceof Error ? error.message : 'unknown social radar error',
    }, { status: 500 });
  }
}
