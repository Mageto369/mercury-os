# Mercury Open Data Mesh

Mercury separates data by evidence authority. Provider convenience never overrides provenance.

## Evidence classes

1. Authoritative public agency: official regulator/government source. May support governance and structural-risk decisions.
2. Licensed market feed: commercial market-data provider. Used for live price/liquidity observations according to its license.
3. Aggregation bridge: OpenBB or similar routing layer. Evidence authority remains the underlying provider, not the bridge.
4. Research fallback: public/unofficial market sources. May be used for development, cross-checking, or replay only unless legal/data-quality review promotes the source.
5. Synthetic validation: generated Mercury fixtures. Never qualifies promotion or live evidence.

## Integrated authoritative sources

### SEC EDGAR

Base: `https://data.sec.gov`

Mercury uses:
- `/submissions/CIK##########.json` for filing history.
- `/api/xbrl/companyfacts/CIK##########.json` for structured XBRL facts.

No API key is required. `SEC_USER_AGENT` is required and must identify Mercury with a contact method. Company facts are stored in `sec_company_facts`. Existing filing ingestion remains separate in `filings`.

### FINRA Reg SHO

Base: `https://api.finra.org`

Mercury uses the public dataset:
- group: `otcMarket`
- dataset: `regShoDaily`

The dataset contains daily aggregated short-sale volume reported to FINRA trade reporting facilities and is limited by FINRA to a rolling historical window. Records are stored in `finra_regsho_daily` and mapped to tracked securities when symbols match.

Important: FINRA short-sale volume is not short interest. Mercury must not label or score it as short interest.

## Optional OpenBB bridge

`OPENBB_API_URL` identifies a self-hosted OpenBB REST API. OpenBB is an integration layer, not a data owner. Mercury treats OpenBB responses according to the actual underlying provider named in the response.

Recommended endpoint for future historical-price bridge:
`/api/v1/equity/price/historical`

Do not enable a provider in production until its terms and commercial-use rights have been reviewed.

## Operational endpoints

- `GET /api/providers/open-data/status`
- `POST /api/providers/open-data/pull` protected by `CRON_SECRET`

The intelligence cron refreshes market data and the open-data mesh before the Supervisor evaluates the warehouse.

## Provider health

`provider_health` stores:
- configured state
- authoritative flag
- current health
- consecutive failures
- last success/failure
- latency
- records received
- last error

No provider failure can enable capital execution. Mercury remains shadow-only.

## Idempotency and provenance

Provider-specific tables have natural uniqueness constraints. Repeated pulls are safe. Raw provider payloads are retained for auditability where practical.

Synthetic validation records must remain identifiable and excluded from live promotion evidence.

## Current production hierarchy

Regulatory/company evidence:
SEC EDGAR > other licensed/verified regulatory sources > aggregation/research sources

OTC/short-sale evidence:
FINRA > licensed derived sources > aggregation/research sources

Market prices:
Massive primary > Intrinio fallback > optional OpenBB/research bridge

Historical replay:
Licensed historical market provider first. Public/research providers may supplement cross-validation but do not silently replace licensed evidence.
