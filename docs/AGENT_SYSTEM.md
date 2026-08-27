# Mercury OS Autonomous Agent System

Mercury OS is a supervised, shadow-only multi-agent market research system. Every agent has a bounded mandate, explicit dependencies, auditable outputs, and hard authority limits. No agent has broker, order-routing, or live capital authority.

## Command structure

Mercury Supervisor coordinates the research fleet. Before assigning work it invokes two independent controls:

- Custodian validates freshness and data quality across market, social, share-structure, and regulatory domains.
- Arbiter verifies agent authority, hard limits, autonomy guardrails, and the capital-execution lock.

Supervisor then assigns dependency-ordered missions, records heartbeats, persists workflow audits, escalates degraded critical jobs, invokes Vector after discovery when market data is fresh enough, and routes operational alerts when escalation is required.

## The 12-agent fleet

### 1. Mercury Supervisor
Chief autonomous research coordinator. Owns assignment, escalation, system-state reporting, and audit orchestration. Cannot trade, allocate capital, override risk, or fabricate provider data.

### 2. Custodian, Data Quality Agent
Measures freshness and availability before any signal is treated as current. Stale or absent observations remain explicitly stale or absent.

### 3. Arbiter, Governance Agent
Verifies authority boundaries and hard limits. It cannot weaken guardrails or grant trading/broker authority.

### 4. Atlas, Market Regime Agent
Measures speculative posture, breadth proxies, liquidity distribution, volatility, and market regime. Produces regime and aggression ceilings, never security approval.

### 5. Pulse, Liquidity Agent
Measures dollar volume, spread quality, RVOL, float rotation, liquidity deterioration, and tradability.

### 6. Prospector, Gem Scout Agent
Finds asymmetric candidates from observed liquidity, catalysts, structure, attention, regime, and risk state.

### 7. Echo, Social Wave Agent
Aggregates authorized Reddit, Discord, Telegram, and Facebook signals. Measures propagation, velocity, crowding, promotion risk, and source leadership. It never posts, promotes, coordinates trades, or performs unauthorized scraping.

### 8. Edgar, Regulatory Agent
Ingests public SEC submissions for tracked CIKs and converts filing metadata into catalyst, dilution, governance, and insider events.

### 9. CapTable, Structure Agent
Tracks share counts, float, authorized overhang, splits, and normalized corporate actions. Missing or unverified structure stays explicitly unverified.

### 10. Sentinel, Risk Agent
Independent structural, dilution, liquidity, promotion, and peak-risk gatekeeper. Hard blocks are binding for alpha agents.

### 11. Vector, Opportunity Director
Converts validated candidates into persistent shadow opportunities and decision logs. It recommends research states such as WATCH, GEM_WATCH, WAVE_ACTIVE, PRESS, REDUCE, EXIT, or BLOCK. It has no broker credentials or order-submission authority.

### 12. Replay, Learning Agent
Reviews opportunities, decisions, outcomes, workflow history, and drift evidence. It can propose model changes, but cannot self-promote a model or rewrite history.

## Supervisor phase order

1. Custodian freshness preflight
2. Arbiter governance preflight
3. Pulse, liquidity-pulse
4. Echo, social-radar
5. Edgar, sec-filings
6. CapTable, share-structure
7. CapTable, corporate-action analysis
8. Sentinel, risk-gateway
9. Atlas, market-regime
10. Prospector, gem-discovery
11. Vector, opportunity generation when discovery ran, Postgres is configured, and market freshness passes
12. Replay, model-learning on its scheduled cadence

## Autonomous post-processing loop

After Supervisor completes, the intelligence cron performs research-only post-processing:

1. Mature opportunity outcomes at 15 minutes, 60 minutes, and one day.
2. Calculate MFE/MAE excursion evidence.
3. Refresh social-source reputation against matured outcomes.
4. Rebuild the liquidity-aware shadow portfolio through the conservative execution simulator.
5. Persist the resulting evidence for replay, model governance, and promotion gates.

No step submits an order.

## Intelligence Lab

Mercury's institutional research layer includes:

- Alpha Signal Catalog: versionable signal definitions across catalyst, liquidity, microstructure, attention, structure, dilution, insider, regime, sympathy, volatility, quality, and distribution families.
- Opportunity Outcomes: forward returns plus MFE/MAE evidence.
- Historical Twins: nearest historical situations based on opportunity feature geometry and state.
- Source Reputation: outcome-linked reliability, lead/late behavior, promotion rate, and positive 60-minute rate.
- Model Registry: champion/challenger model identity, feature manifest, validation evidence, experiment history, promotion evidence, and retirement state.
- Execution Simulator: conservative spread, participation, impact, fill probability, capacity, and discontinuity-risk estimates.
- Shadow Portfolio Brain: liquidity-capped simulated exposure subject to gross and per-position limits.
- Independent Kill-Switch Network: emergency halt, governance violations, persistent-store failure, stale market data, fleet failures, unresolved critical incidents, and shadow drawdown governor.

## Evidence ladder

DISCOVERED -> OBSERVED -> CONFIRMED -> QUALIFIED -> SHADOW -> PROVEN -> PAPER REVIEW ELIGIBLE

Paper-review eligibility does not enable trading. Live capital remains outside the system's current authority.

## Scheduling

- Liquidity and risk: every minute
- Social radar: every two minutes
- SEC filings and market regime: every five minutes
- Gem discovery and share structure: every fifteen minutes
- Corporate actions: every thirty minutes
- Replay/model learning: daily
- Outcome maturation, source reputation, and shadow portfolio refresh: after each intelligence cron invocation

## Safety and failure behavior

- AUTONOMY_HALT=true stops research execution.
- Missing providers produce skipped or degraded results instead of fabricated state.
- Custodian can prevent stale market data from reaching Vector.
- Arbiter prevents authority expansion.
- Sentinel blocks cannot be overridden by alpha agents.
- Kill switches remain independent from opportunity scoring.
- Broker authority remains NONE.
- Capital execution remains false and locked throughout all current APIs and workflows.

## Principal APIs

- GET /api/agents
- GET /api/agents/health
- POST /api/agents/run
- GET /api/cron/intelligence
- GET /api/autonomy/status
- GET /api/activation/readiness
- POST /api/activation/launch
- GET /api/activation/promotion
- GET/POST /api/performance/evidence
- GET /api/research/signals
- GET /api/research/twins?opportunityId=...
- GET/POST /api/research/source-reputation
- GET /api/models/governance
- GET /api/risk/kill-switches
- GET/POST /api/portfolio/shadow

## Supabase deployment requirement

Mercury now uses a generic Postgres runtime compatible with Supabase. Configure DATABASE_URL using a server-side Supabase pooled Postgres connection string. Apply both migrations under supabase/migrations or invoke the protected bootstrap endpoint after DATABASE_URL is configured.

The activation sequence is:

Supabase/Postgres -> full warehouse bootstrap -> model baseline -> validation seed -> Supervisor fleet -> opportunity persistence -> outcome maturation -> source reputation -> shadow portfolio -> readiness -> promotion evidence.

Only authorized live feed adapters and credentials remain external to the repository.
