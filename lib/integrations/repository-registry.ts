export type IntegrationRole = 'native' | 'sidecar' | 'reference' | 'research-fallback';
export type EvidenceClass = 'authoritative' | 'licensed' | 'reference' | 'research';

type Integration = {id:string;repo:string;role:IntegrationRole;evidence:EvidenceClass;purpose:string;enabledEnv:string;sharedOpenIntelligence?:boolean;sharedResearchProof?:boolean};

export const repositoryIntegrations = [
  { id:'edgartools', repo:'dgunning/edgartools', role:'sidecar', evidence:'authoritative', purpose:'SEC filing parsing, offerings, insider, institutional and point-in-time XBRL intelligence', enabledEnv:'EDGARTOOLS_URL', sharedOpenIntelligence:true },
  { id:'sec-cik-mapper', repo:'jadchaar/sec-cik-mapper', role:'reference', evidence:'reference', purpose:'Ticker/CIK issuer identity reconciliation', enabledEnv:'SEC_CIK_MAPPER_URL', sharedOpenIntelligence:true },
  { id:'financedatabase', repo:'JerBouma/FinanceDatabase', role:'reference', evidence:'reference', purpose:'Instrument reference metadata and identifier enrichment', enabledEnv:'FINANCE_DATABASE_URL', sharedOpenIntelligence:true },
  { id:'openbb', repo:'OpenBB-finance/OpenBB', role:'sidecar', evidence:'research', purpose:'Provider abstraction and research-grade historical fallback', enabledEnv:'OPENBB_API_URL' },
  { id:'market-calendars', repo:'rsheftel/pandas_market_calendars', role:'sidecar', evidence:'reference', purpose:'Exchange sessions, holidays and early-close schedules', enabledEnv:'MARKET_CALENDAR_URL', sharedOpenIntelligence:true },
  { id:'fredapi', repo:'mortada/fredapi', role:'sidecar', evidence:'authoritative', purpose:'FRED and ALFRED point-in-time macro regime observations', enabledEnv:'FRED_SIDECAR_URL', sharedOpenIntelligence:true },
  { id:'vectorbt', repo:'polakowo/vectorbt', role:'sidecar', evidence:'research', purpose:'Large-scale hypothesis, walk-forward and robustness experiments', enabledEnv:'VECTORBT_URL', sharedResearchProof:true },
  { id:'quantstats', repo:'ranaroussi/quantstats', role:'sidecar', evidence:'research', purpose:'Performance, tail-risk and proof metrics', enabledEnv:'QUANTSTATS_URL', sharedResearchProof:true },
  { id:'yfinance', repo:'ranaroussi/yfinance', role:'research-fallback', evidence:'research', purpose:'Non-authoritative research cross-check only', enabledEnv:'YFINANCE_SIDECAR_URL', sharedResearchProof:true },
  { id:'backtrader', repo:'mementum/backtrader', role:'sidecar', evidence:'research', purpose:'Independent execution/backtest simulation challenger', enabledEnv:'BACKTRADER_URL', sharedResearchProof:true },
] as const satisfies ReadonlyArray<Integration>;

export function getRepositoryIntegrationStatus() {
  return repositoryIntegrations.map(x => {
    const openIntel = 'sharedOpenIntelligence' in x && x.sharedOpenIntelligence === true;
    const researchProof = 'sharedResearchProof' in x && x.sharedResearchProof === true;
    return {...x, configured:Boolean(process.env[x.enabledEnv] || (openIntel && process.env.OPEN_INTELLIGENCE_URL) || (researchProof && process.env.RESEARCH_PROOF_URL)), capitalExecutionEnabled:false as const};
  });
}
