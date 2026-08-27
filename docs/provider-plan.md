# Provider Integration Plan

## Priority 0

- Postgres warehouse
- Live market data
- SEC EDGAR filings
- FINRA corporate actions
- OTC share structure

## Priority 1

- Reddit approved API access
- Discord authorized servers
- Telegram authorized channels
- Facebook permissioned group/page sources

## Provider rules

Every adapter returns normalized domain contracts and provider health. Raw payloads are preserved for audit and replay. Provider failures lower data confidence and may block a decision when the missing feed is critical.

## Execution rule

No provider adapter is allowed to place trades in the current phase.
