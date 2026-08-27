# Mercury OS

Institutional microcap intelligence platform for calculated high-risk, high-reward discovery, market outlook, social/promotion surveillance, liquidity analysis, risk gating, and autonomous research workflows.

## Current phase

The application shell, scoring engine, protected cron dispatcher, shadow APIs, responsive institutional dashboard, dependency security gate, and desktop/mobile browser regression suite are implemented.

## Operating principle

Mercury OS searches for asymmetric microcap opportunities early, requires independent confirmation across structure, catalyst, liquidity, market regime, and attention, then reduces exposure when peak, dilution, promotion, or liquidity risk rises.

## Stack

- Next.js App Router
- TypeScript
- Vercel deployment and one-minute cron dispatcher
- Postgres-ready persistence layer
- Autonomous shadow research workflows
- Playwright desktop and mobile regression testing

## Deploy

[Deploy Mercury OS to Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMageto369%2Fmercury-os&project-name=mercury-os&repository-name=mercury-os)

After import, configure `CRON_SECRET` first. Provider credentials from `.env.example` can then be enabled individually.

## Validation gate

Every main-branch release runs:

```bash
npm install
npm audit --audit-level=moderate
npm run typecheck
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

The browser suite checks desktop and mobile navigation, opportunity ranking, ticker selection, manual intelligence pulses, API contracts, score bounds, shadow execution, cron authentication, and health/version reporting.

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` before connecting production data providers.
