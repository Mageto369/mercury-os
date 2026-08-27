import { NextResponse } from 'next/server';
import { getProviderReadiness } from '@/lib/autonomy/providers';
import { evaluateAutonomyGuardrails } from '@/lib/risk/autonomy-guardrails';
import { intelligenceJobs } from '@/lib/workflows/jobs';

export const runtime = 'nodejs';

export async function GET() {
  const providers = getProviderReadiness();
  const guardrails = evaluateAutonomyGuardrails();
  const configured = Object.values(providers).filter((provider) => provider.configured).length;

  return NextResponse.json({
    ok: true,
    mode: 'shadow',
    capitalExecutionEnabled: false,
    autonomousResearchEnabled: guardrails.researchExecutionAllowed,
    requiredInfrastructureReady: guardrails.coreInfrastructureReady,
    guardrails,
    configuredProviders: configured,
    totalProviders: Object.keys(providers).length,
    providers,
    jobs: intelligenceJobs,
    checkedAt: new Date().toISOString(),
  });
}
