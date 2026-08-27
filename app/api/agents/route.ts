import { NextResponse } from 'next/server';
import { runDataQualityAgent } from '@/lib/agents/data-quality';
import { runGovernanceAgent } from '@/lib/agents/governance';
import { agentRegistry } from '@/lib/agents/registry';
import { getProviderReadiness } from '@/lib/autonomy/providers';
import { evaluateAutonomyGuardrails } from '@/lib/risk/autonomy-guardrails';

export const runtime = 'nodejs';

export async function GET() {
  const providers = getProviderReadiness();
  const guardrails = evaluateAutonomyGuardrails();
  const [dataQuality, governance] = await Promise.all([
    runDataQualityAgent(),
    Promise.resolve(runGovernanceAgent()),
  ]);

  return NextResponse.json({
    ok: true,
    mode: 'shadow',
    capitalExecutionEnabled: false,
    supervisor: 'mercury-supervisor',
    agents: agentRegistry,
    providerReadiness: providers,
    guardrails,
    controls: { dataQuality, governance },
    checkedAt: new Date().toISOString(),
  });
}
