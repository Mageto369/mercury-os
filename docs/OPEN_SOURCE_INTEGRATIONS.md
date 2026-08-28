# Mercury Open-Source Integration Fabric

Mercury integrates external repositories through governed boundaries. External code never receives broker authority and never bypasses provenance, Custodian, Arbiter, Sentinel, replay, or promotion gates.

## Integration map

- `dgunning/edgartools` — Python sidecar for structured SEC filing intelligence: offerings, S-1/S-3/424B lifecycle, Form 4 insiders, 13F holdings, point-in-time XBRL and filing sections. Authoritative evidence remains SEC EDGAR.
- `jadchaar/sec-cik-mapper` — reference identity feed for ticker/CIK reconciliation.
- `JerBouma/FinanceDatabase` — reference-only instrument metadata and identifiers; never a live price authority.
- `OpenBB-finance/OpenBB` — optional provider bridge. Mercury persists the upstream provider, not merely `openbb`.
- `rsheftel/pandas_market_calendars` — exchange-session sidecar for holidays, early closes and tradable-time calculations.
- `mortada/fredapi` — FRED/ALFRED sidecar for point-in-time macro vintages. Federal Reserve observations are authoritative macro evidence.
- `polakowo/vectorbt` — research sidecar for large-scale hypothesis, walk-forward and robustness experiments.
- `ranaroussi/quantstats` — proof sidecar for performance/tail-risk/Monte Carlo metrics.
- `ranaroussi/yfinance` — research fallback only. It cannot satisfy an authoritative or licensed-data gate.
- `mementum/backtrader` — independent research challenger for execution/backtest simulation; never live execution.

## Warehouse additions

Migration `20260828_005_open_source_intelligence.sql` adds:

- `security_identities`
- `insider_transactions`
- `institutional_holdings`
- `financing_events`
- `market_sessions`
- `macro_observations`
- `research_experiments`
- `proof_metrics`

## Evidence flow

`external repository -> isolated adapter/sidecar -> normalized contract -> provenance/evidence classification -> Supabase -> Custodian -> research agents -> shadow evidence -> proof/promotion gates`

## Security rules

1. Sidecars are server-side only.
2. Calls time out and fail closed.
3. No sidecar gets `CRON_SECRET`, broker credentials, or capital authority.
4. Research fallbacks cannot be promoted to authoritative evidence.
5. Point-in-time data must preserve observation/vintage dates to prevent lookahead leakage.
6. All model experiments remain shadow-only.
7. Repository upgrades require CI and regression validation before production rollout.

## Deployment topology

Keep the Next.js Mercury control plane on Vercel. Run Python-heavy repositories as isolated container services (for example on a container host) and expose only narrow authenticated HTTP contracts. Supabase remains the shared evidence warehouse. This avoids embedding a Python runtime into the Next.js deployment and makes each research engine independently replaceable.
