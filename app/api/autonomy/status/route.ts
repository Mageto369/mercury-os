import { NextResponse } from 'next/server';
import { getProviderReadiness } from '@/lib/autonomy/providers';
import { intelligenceJobs } from '@/lib/workflows/jobs';

export const runtime = 'nodejs';

export async function GET() {
  const providers = getProviderReadiness();
  const configured = Object.values(providers).filter((provider) => provider.configured).length;
  const requiredReady = Object.values(providers)
    .filter((provider) => provider.requiredForAutonomy)
    .every((provider) => provider.configured);

  return NextResponse.json({
    ok: true,
    mode: 'shadow',
    capitalExecutionEnabled: false,
    autonomousResearchEnabled: true,
    requiredInfrastructureReady: requiredReady,
    configuredProviders: configured,
    totalProviders: Object.keys(providers).length,
    providers,
    jobs: intelligenceJobs,
    checkedAt: new Date().toISOString(),
  });
}
