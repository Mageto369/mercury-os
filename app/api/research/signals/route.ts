import { NextResponse } from 'next/server';
import { signalCatalog, signalFamilies } from '@/lib/alpha/signal-catalog';

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: 'shadow',
    capitalExecutionEnabled: false,
    families: signalFamilies,
    count: signalCatalog.length,
    signals: signalCatalog,
  });
}
