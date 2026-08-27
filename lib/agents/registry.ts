import type { IntelligenceJobName } from '@/lib/workflows/jobs';

export type AgentId =
  | 'mercury-supervisor'
  | 'market-regime-agent'
  | 'liquidity-agent'
  | 'gem-scout-agent'
  | 'social-wave-agent'
  | 'regulatory-agent'
  | 'structure-agent'
  | 'risk-sentinel-agent'
  | 'opportunity-director-agent'
  | 'learning-agent';

export type AgentAuthority = 'observe' | 'ingest' | 'score' | 'gate' | 'persist' | 'alert' | 'assign';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  mission: string;
  ownsJobs: IntelligenceJobName[];
  authority: AgentAuthority[];
  inputs: string[];
  outputs: string[];
  dependencies: AgentId[];
  escalationTo?: AgentId;
  hardLimits: string[];
}

export const agentRegistry: AgentDefinition[] = [
  {
    id: 'mercury-supervisor',
    name: 'Mercury Supervisor',
    role: 'Chief autonomous research coordinator',
    mission: 'Assign due research work, enforce dependencies and guardrails, collect outcomes, and maintain one auditable system state.',
    ownsJobs: [],
    authority: ['assign', 'gate', 'persist', 'alert'],
    inputs: ['job schedule', 'provider readiness', 'autonomy guardrails', 'agent health', 'workflow outcomes'],
    outputs: ['agent assignments', 'run summary', 'escalations', 'system state'],
    dependencies: [],
    hardLimits: ['No broker access', 'No capital allocation', 'No override of risk blocks', 'No fabricated provider data'],
  },
  {
    id: 'market-regime-agent',
    name: 'Atlas',
    role: 'Market regime strategist',
    mission: 'Measure speculative conditions, breadth, liquidity quality, volatility and market posture before microcap aggression increases.',
    ownsJobs: ['market-regime'],
    authority: ['observe', 'score', 'persist'],
    inputs: ['market snapshots', 'breadth proxies', 'spread distribution', 'RVOL distribution'],
    outputs: ['regime label', 'outlook score', 'aggression ceiling'],
    dependencies: ['liquidity-agent'],
    escalationTo: 'mercury-supervisor',
    hardLimits: ['Cannot approve a security', 'Cannot override structural risk'],
  },
  {
    id: 'liquidity-agent',
    name: 'Pulse',
    role: 'Liquidity and microstructure analyst',
    mission: 'Detect tradable liquidity, spread deterioration, RVOL acceleration and float rotation before opportunity scoring.',
    ownsJobs: ['liquidity-pulse'],
    authority: ['observe', 'score', 'persist', 'alert'],
    inputs: ['market snapshots', 'bid/ask', 'dollar volume', 'RVOL', 'float rotation'],
    outputs: ['liquidity score', 'tradability state', 'deterioration alerts'],
    dependencies: [],
    escalationTo: 'risk-sentinel-agent',
    hardLimits: ['Cannot infer missing quotes', 'Cannot mark stale data as live'],
  },
  {
    id: 'gem-scout-agent',
    name: 'Prospector',
    role: 'Asymmetric microcap discovery agent',
    mission: 'Find quiet, under-followed securities where liquidity, catalyst timing, clean structure and attention gap create asymmetric potential.',
    ownsJobs: ['gem-discovery'],
    authority: ['observe', 'score', 'persist', 'alert'],
    inputs: ['liquidity signals', 'SEC events', 'share structure', 'social trends', 'market regime', 'risk flags'],
    outputs: ['gem candidates', 'gem score', 'attention-gap score', 'candidate rationale'],
    dependencies: ['market-regime-agent', 'liquidity-agent', 'regulatory-agent', 'structure-agent', 'social-wave-agent', 'risk-sentinel-agent'],
    escalationTo: 'opportunity-director-agent',
    hardLimits: ['Blocked securities cannot become actionable', 'No ranking without observed market data'],
  },
  {
    id: 'social-wave-agent',
    name: 'Echo',
    role: 'Social propagation and promotion-forensics agent',
    mission: 'Measure authorized social attention across sources, detect propagation order, crowding and promotion risk, and distinguish early attention from late saturation.',
    ownsJobs: ['social-radar'],
    authority: ['ingest', 'observe', 'score', 'persist', 'alert'],
    inputs: ['authorized Reddit signals', 'authorized Discord signals', 'authorized Telegram signals', 'authorized Facebook signals'],
    outputs: ['velocity', 'cross-source confirmation', 'crowding', 'promotion risk', 'source leadership'],
    dependencies: [],
    escalationTo: 'risk-sentinel-agent',
    hardLimits: ['No unauthorized scraping', 'No posting or promotion', 'No coordinated trading activity'],
  },
  {
    id: 'regulatory-agent',
    name: 'Edgar',
    role: 'SEC and catalyst intelligence agent',
    mission: 'Continuously ingest material SEC filings and convert forms into catalyst, dilution, governance and insider signals.',
    ownsJobs: ['sec-filings'],
    authority: ['ingest', 'observe', 'score', 'persist', 'alert'],
    inputs: ['SEC submissions', 'tracked CIK universe'],
    outputs: ['filing records', 'dilution signals', 'catalyst signals', 'insider signals'],
    dependencies: [],
    escalationTo: 'risk-sentinel-agent',
    hardLimits: ['Only public regulatory sources', 'No interpretation beyond available filing metadata without supporting parser evidence'],
  },
  {
    id: 'structure-agent',
    name: 'CapTable',
    role: 'Share structure and corporate-action agent',
    mission: 'Track float, shares outstanding, authorized shares, splits and corporate actions, then surface material structural deterioration.',
    ownsJobs: ['share-structure', 'finra-actions'],
    authority: ['ingest', 'observe', 'score', 'persist', 'alert'],
    inputs: ['share structure observations', 'corporate actions'],
    outputs: ['dilution expansion', 'split risk', 'structure quality', 'hard-risk events'],
    dependencies: [],
    escalationTo: 'risk-sentinel-agent',
    hardLimits: ['Never assume split absence from missing data', 'Unverified structure remains explicitly unverified'],
  },
  {
    id: 'risk-sentinel-agent',
    name: 'Sentinel',
    role: 'Independent risk and manipulation gatekeeper',
    mission: 'Block structural, dilution, liquidity, promotion and peak-risk setups before they reach the opportunity director.',
    ownsJobs: ['risk-gateway'],
    authority: ['observe', 'score', 'gate', 'persist', 'alert'],
    inputs: ['corporate actions', 'SEC dilution events', 'share structure changes', 'liquidity state', 'promotion risk'],
    outputs: ['hard blocks', 'risk reasons', 'risk score', 'escalations'],
    dependencies: ['liquidity-agent', 'social-wave-agent', 'regulatory-agent', 'structure-agent'],
    escalationTo: 'mercury-supervisor',
    hardLimits: ['Risk blocks are not overridable by alpha agents', 'Capital execution always remains outside agent authority'],
  },
  {
    id: 'opportunity-director-agent',
    name: 'Vector',
    role: 'Shadow opportunity and portfolio decision director',
    mission: 'Combine validated research into persistent shadow opportunities, rank asymmetry, and recommend watch, press, reduce, exit or block states.',
    ownsJobs: [],
    authority: ['observe', 'score', 'gate', 'persist', 'alert'],
    inputs: ['gem candidates', 'market regime', 'liquidity', 'social trends', 'risk flags', 'catalysts'],
    outputs: ['shadow opportunities', 'decision logs', 'aggression level', 'risk multiplier'],
    dependencies: ['gem-scout-agent', 'risk-sentinel-agent', 'market-regime-agent'],
    escalationTo: 'mercury-supervisor',
    hardLimits: ['No order submission', 'No broker credentials', 'Hard blocks remain binding'],
  },
  {
    id: 'learning-agent',
    name: 'Replay',
    role: 'Model evaluation and learning agent',
    mission: 'Analyze prior signals, missed runners, false positives, peak timing and decision quality to produce model-improvement evidence.',
    ownsJobs: ['model-learning'],
    authority: ['observe', 'score', 'persist', 'alert'],
    inputs: ['historical snapshots', 'opportunities', 'decision logs', 'workflow runs', 'system events'],
    outputs: ['performance attribution', 'drift report', 'candidate model changes', 'replay cases'],
    dependencies: ['opportunity-director-agent'],
    escalationTo: 'mercury-supervisor',
    hardLimits: ['Cannot self-promote a model to production', 'Cannot rewrite historical records'],
  },
];

export const agentsById = Object.fromEntries(agentRegistry.map((agent) => [agent.id, agent])) as Record<AgentId, AgentDefinition>;

export function agentForJob(job: IntelligenceJobName) {
  return agentRegistry.find((agent) => agent.ownsJobs.includes(job));
}
