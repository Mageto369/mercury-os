# Mercury OS Autonomous Agent System

Mercury OS uses a supervised multi-agent research architecture. Every agent has a bounded mandate, explicit inputs and outputs, an escalation path, and hard authority limits. Capital execution is outside the authority of every agent.

## Command structure

Mercury Supervisor is the chief coordinator. It reads the schedule, provider readiness, system guardrails, due jobs, and prior worker outcomes. It assigns work in dependency-aware phases, records outcomes, escalates degraded critical jobs, and invokes the Opportunity Director after Gem Discovery when the warehouse is available.

## Agents

### Mercury Supervisor
Coordinates the whole autonomous research fleet. Owns assignment, escalation, system-state reporting, and audit orchestration. It cannot trade, allocate capital, override risk blocks, or invent missing feed data.

### Atlas, Market Regime Agent
Owns market-regime. Measures the market posture from persisted market observations and produces regime, outlook, liquidity context, and aggression ceilings.

### Pulse, Liquidity Agent
Owns liquidity-pulse. Scores recent market snapshots for tradability, dollar volume, spread quality, RVOL, float rotation, and deterioration.

### Prospector, Gem Scout Agent
Owns gem-discovery. Combines liquidity, catalysts, share structure, social attention, market regime, and risk flags to identify asymmetric candidates.

### Echo, Social Wave Agent
Owns social-radar. Aggregates authorized social signals from permitted Reddit, Discord, Telegram, and Facebook collectors. Measures attention velocity, source count, crowding, promotion risk, and confirmation. It never posts, promotes, coordinates trades, or performs unauthorized scraping.

### Edgar, Regulatory Agent
Owns sec-filings. Ingests SEC submission data for tracked CIKs, stores filings idempotently, and emits structured catalyst, dilution, governance, and insider signals.

### CapTable, Structure Agent
Owns share-structure and finra-actions. Tracks share-count expansion and normalized corporate actions, including reverse-split risk. Official external FINRA ingestion remains an adapter boundary, while normalized corporate-action analysis is operational now.

### Sentinel, Risk Agent
Owns risk-gateway. Independently applies structural, dilution, liquidity, manipulation, and peak-risk gates. A Sentinel hard block is binding for all alpha agents.

### Vector, Opportunity Director
Runs after discovery when the research warehouse is ready. Converts validated candidates into persistent shadow opportunities and decision logs. Vector has no broker credentials and no order-submission authority.

### Replay, Learning Agent
Owns model-learning. Reviews historical shadow opportunities and decisions, measures blocked rate and confidence-risk conflicts, detects drift, and emits a model-drift event for human review. Replay cannot promote a model to production.

## Supervisor phase order

1. Pulse, liquidity-pulse
2. Echo, social-radar
3. Edgar, sec-filings
4. CapTable, share-structure
5. CapTable, corporate-action analysis
6. Sentinel, risk-gateway
7. Atlas, market-regime
8. Prospector, gem-discovery
9. Vector, opportunity generation when discovery ran and Postgres is ready
10. Replay, model-learning on its daily schedule

## Automation cadence

Liquidity and risk run each minute. Social Radar runs every two minutes. SEC filings and market regime run every five minutes. Gem Discovery and share structure run every fifteen minutes. Corporate actions run every thirty minutes. Replay runs daily.

## Safety and failure behavior

AUTONOMY_HALT=true stops research execution. Missing providers produce skipped or degraded outcomes. No agent fabricates live state. Cron and manual missions require the configured secret. Every ordinary specialist result is eligible for workflow and autonomous-action persistence when Postgres is available. All capital execution remains disabled.

## APIs

GET /api/agents returns the full agent registry and guardrail state.

POST /api/agents/run accepts a protected list of scheduled job names and asks Mercury Supervisor to assign those missions manually.

GET /api/cron/intelligence invokes Mercury Supervisor for jobs due at the current minute.

GET /api/autonomy/status exposes provider readiness and autonomy safety state.

## Deployment requirement

The complete agent system becomes data-operational after DATABASE_URL is configured and the core migration is applied. Live feed collectors then send normalized market, social, share-structure, and corporate-action observations through the protected ingestion endpoints. SEC ingestion runs directly from public EDGAR once SEC_USER_AGENT and tracked CIKs are configured.
