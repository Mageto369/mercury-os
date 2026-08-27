# Mercury OS Market Data Fabric

Mercury normalizes external market vendors before data reaches research scoring. Vendor-specific payloads never flow directly into alpha or risk decisions.

## Provider order

Default mode is `auto`:

1. Massive
2. Intrinio

`MARKET_DATA_PROVIDER=massive` or `MARKET_DATA_PROVIDER=intrinio` pins one provider.

Massive is the preferred primary adapter because its U.S. stocks product documents coverage across major exchanges, dark pools, FINRA facilities, and OTC markets. Intrinio is retained as an independent second adapter and supports per-security realtime prices plus configurable realtime sources.

## Environment

```text
MARKET_DATA_PROVIDER=auto
MASSIVE_API_KEY=
INTRINIO_API_KEY=
MARKET_PULL_MAX_SYMBOLS=750
MARKET_PULL_CONCURRENCY=8
```

`MARKET_DATA_API_KEY` remains accepted as a legacy/general fallback for the Massive adapter.

## Runtime order

The one-minute intelligence cron performs:

```text
live market pull
-> normalized persistence
-> Custodian freshness preflight
-> Mercury Supervisor fleet
-> opportunity generation
-> outcome maturation
-> source reputation refresh
-> shadow portfolio rebuild
```

This ordering prevents the research fleet from evaluating stale warehouse state immediately before a feed refresh.

## Normalized contract

Every provider produces:

- symbol
- last price
- volume
- dollar volume
- bid/ask when available
- spread in basis points when possible
- observation timestamp
- source/provider identity

Float rotation is calculated inside Mercury using the latest persisted share-structure observation instead of trusting a vendor float field.

## Safety behavior

- Provider errors do not enable broker or trade authority.
- Missing database fails closed.
- Missing provider credentials fails closed.
- In `auto` mode, the next configured provider is attempted after a provider-level failure.
- Provider payloads are stored only as research provenance.
- Capital execution remains disabled.

## APIs

`GET /api/providers/market/status` returns configured adapters and failover preference without exposing credentials.

`POST /api/providers/market/pull` performs a protected market refresh and requires `CRON_SECRET`.

The same refresh is performed automatically before the Supervisor fleet on `/api/cron/intelligence`.
