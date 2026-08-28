# Mercury OS

Mercury OS is a supervised, institutional microcap intelligence and research operating system. It combines market, regulatory, share-structure, authorized social, liquidity, risk, model-governance, execution-simulation, and realized-outcome evidence in a shadow-only autonomous architecture.

## Current release

Version 0.4 adds a Supabase-compatible generic Postgres runtime and the Mercury Intelligence Lab.

Implemented capabilities include:

- 12 bounded research agents coordinated by Mercury Supervisor
- Custodian data-freshness preflight and Arbiter governance preflight
- SEC EDGAR ingestion and normalized market/social/structure/corporate-action adapters
- persistent opportunity and decision history
- synthetic validation universe
- production-readiness scoring
- shadow promotion evidence gate
- 15m/60m/1d opportunity outcomes plus MFE/MAE
- 25+ formal signal definitions across 12 alpha/risk families
- outcome-linked social-source reputation
- historical-twin retrieval
- champion/challenger model registry and experiment history
- conservative execution simulation and liquidity capacity
- liquidity-capped shadow portfolio construction
- independent kill-switch network
- agent heartbeats, alerts, replay history, and autonomous audit logs
- desktop/mobile Playwright regression coverage

## Operating principle

Mercury searches for asymmetric situations early, requires independent confirmation across catalyst, structure, liquidity, regime, attention, and data quality, then reduces conviction as dilution, promotion, distribution, liquidity, or peak risk rises.

No component currently has broker credentials or live capital authority. Capital execution is locked.

## Stack

- Next.js App Router
- React + TypeScript
- Drizzle ORM
- generic Postgres.js runtime compatible with Supabase
- Vercel deployment and cron orchestration
- Playwright desktop/mobile E2E testing

## Supabase activation

Apply both migrations under `supabase/migrations`, then configure the server-side Supabase pooled Postgres connection string as `DATABASE_URL`.

The protected activation path then performs:

```text
warehouse bootstrap
-> intelligence-lab bootstrap
-> baseline model registration
-> validation universe seed
-> Supervisor fleet
-> shadow opportunities
-> outcome maturation
-> source reputation
-> shadow portfolio
-> readiness and promotion evidence
```

See `docs/supabase-activation.md` and `docs/AGENT_SYSTEM.md`.

## Deploy

[Deploy Mercury OS to Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMageto369%2Fmercury-os&project-name=mercury-os&repository-name=mercury-os)

Configure `CRON_SECRET` and `DATABASE_URL` first. Then add only authorized provider credentials from `.env.example`.

## Validation gate

Every main-branch release runs:

```bash
npm ci
npm audit --audit-level=moderate
npm run typecheck
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

The suite validates desktop and mobile UI, agent authority, fail-closed behavior, ingestion boundaries, cron authentication, readiness, promotion gates, intelligence-lab APIs, research-only portfolio behavior, and the permanent capital-execution lock.

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` for local provider configuration. Never expose the Supabase database password or service credentials to browser code.
