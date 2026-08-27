import { NextResponse } from 'next/server';
import { agentRegistry } from '@/lib/agents/registry';
import { getProviderReadiness } from '@/lib/autonomy/providers';
import { evaluateAutonomyGuardrails } from '@/lib/risk/autonomy-guardrails';

export const runtime = 'nodejs';

export async function GET() {
  const providers = getProviderReadiness();
  const guardrails = evaluateAutonomyGuardrails();

  return NextResponse.json({
    ok: true,
    mode: 'shadow',
    capitalExecutionEnabled: false,
    supervisor: 'mercury-supervisor',
    agents: agentRegistry,
    providerReadiness: providers,
    guardrails,
    checkedAt: new Date().toISOString(),
  });
}
