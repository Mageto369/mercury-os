import { getProviderReadiness } from '@/lib/autonomy/providers';

export interface GuardrailState {
  emergencyHalt: boolean;
  coreInfrastructureReady: boolean;
  marketDataReady: boolean;
  databaseReady: boolean;
  capitalExecutionEnabled: false;
  researchExecutionAllowed: boolean;
  reasons: string[];
}

export function evaluateAutonomyGuardrails(): GuardrailState {
  const providers = getProviderReadiness();
  const emergencyHalt = process.env.AUTONOMY_HALT === '1' || process.env.AUTONOMY_HALT === 'true';
  const marketDataReady = providers.marketData.configured;
  const databaseReady = providers.database.configured;
  const coreInfrastructureReady = marketDataReady && databaseReady;
  const reasons: string[] = [];

  if (emergencyHalt) reasons.push('emergency halt is active');
  if (!marketDataReady) reasons.push('market data provider is not configured');
  if (!databaseReady) reasons.push('persistent database is not configured');

  return {
    emergencyHalt,
    coreInfrastructureReady,
    marketDataReady,
    databaseReady,
    capitalExecutionEnabled: false,
    researchExecutionAllowed: !emergencyHalt,
    reasons,
  };
}
