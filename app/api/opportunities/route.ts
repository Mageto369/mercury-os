import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { scoreOpportunity } from '@/lib/alpha/scoring';
import type { OpportunityInput } from '@/lib/domain/types';
import { sampleUniverse } from '@/lib/intelligence/sample-universe';
import { loadDailyHistory } from '@/lib/market/daily-history';
import { applyPricePush, displaySocialScore, EMPTY_PRICE_PUSH, observedCatalystScore, type PricePush } from '@/lib/market/price-push';
import { loadPricePush } from '@/lib/market/attention';
import { rankDailyConsiderations } from '@/lib/market/daily-rank';
import { collectForwardAnalogs, summarizePriceHistory } from '@/lib/market/nasdaq-history';
import { DELAYED_REFERENCE_MODEL, LIVE_SHADOW_MODEL, summarizeOpportunityEvidence } from '@/lib/market/research-quotes';
import { scoreGemCandidate } from '@/lib/workflows/gem-scores';
import { PENNY_MAX_PRICE, PENNY_MIN_DOLLAR_VOLUME, screenPennyStock } from '@/lib/workflows/penny-screen';
import { scoreLiquidity } from '@/lib/workflows/research-scores';
import { runMarketRegimeWorkflow } from '@/lib/workflows/market-regime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function finiteOrNull(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function listingMarket(value: unknown): OpportunityInput['market'] {
  const market = String(value ?? '').toUpperCase();
  switch (market) {
    case 'OTC':
    case 'NASDAQ':
    case 'NYSE':
    case 'AMEX':
      return market;
    default:
      return 'NASDAQ';
  }
}

function scorePennyRow(row: Record<string, unknown>, marketOutlook: number) {
  const price = finiteOrNull(row.price);
  const dollarVolume = finiteOrNull(row.dollar_volume);
  const rvol = finiteOrNull(row.rvol);
  const floatRotation = finiteOrNull(row.float_rotation);
  const spreadBps = finiteOrNull(row.spread_bps);
  const stored = row.id != null && row.alpha != null;
  const reference = String(row.evidence_class ?? '') === 'delayed-reference';
  let gem = Number(row.gem ?? 0);
  let wave = Number(row.wave ?? 0);
  let catalyst = Number(row.catalyst ?? 0);
  let social = Number(row.social ?? 0);
  let liquidity = Number(row.liquidity ?? 0);
  let trapRisk = Number(row.trap_risk ?? 0);
  let peakRisk = Number(row.peak_risk ?? 0);
  let confidence = Number(row.confidence ?? 0);
  let alpha = Number(row.alpha ?? 0);
  let asymmetry = Number(row.asymmetry ?? 0);
  let aggression = Number(row.aggression ?? 1);
  let action = String(row.action ?? 'WATCH');
  let hardBlocked = Boolean(row.hard_blocked);
  let reasons = Array.isArray(row.reasons) ? row.reasons.map(String) : [];
  let state = String(row.state ?? 'DORMANT');
  let modelVersion = row.model_version == null ? (reference ? DELAYED_REFERENCE_MODEL : LIVE_SHADOW_MODEL) : String(row.model_version);

  if (!stored) {
    liquidity = scoreLiquidity(dollarVolume ?? 0, spreadBps, rvol, floatRotation);
    const gemScore = scoreGemCandidate({
      liquidityScore: liquidity,
      marketOutlook,
      catalystScore: null,
      structureScore: null,
      attentionGapScore: null,
      promotionRisk: 0,
      hasRiskFlag: false,
    });
    gem = gemScore.gemScore;
    wave = Math.max(0, Math.min(100, Math.round((rvol ?? 0) * 19 + (floatRotation ?? 0) * 12 + 18)));
    catalyst = 0;
    social = 0;
    trapRisk = 0;
    peakRisk = 0;
    confidence = rvol == null ? 55 : 65;
    const decision = scoreOpportunity({
      symbol: String(row.symbol ?? ''),
      market: listingMarket(row.market),
      price: price ?? 0,
      marketCapUsd: 0,
      floatShares: finiteOrNull(row.float_shares) ?? 0,
      avgDollarVolume20d: dollarVolume ?? 0,
      gem,
      wave,
      catalyst,
      social,
      liquidity,
      marketOutlook,
      reverseSplitRisk: 0,
      dilutionRisk: 0,
      promotionRisk: 0,
      trapRisk,
      peakRisk,
      confidence,
      state: 'DORMANT',
    });
    alpha = decision.alpha;
    asymmetry = decision.asymmetry;
    aggression = decision.aggression;
    action = decision.action;
    hardBlocked = decision.hardBlocked;
    reasons = [...gemScore.reasons, ...decision.reasons, 'penny screen'];
    if (reference) reasons.push('delayed-reference evidence');
    state = 'DORMANT';
    modelVersion = reference ? DELAYED_REFERENCE_MODEL : LIVE_SHADOW_MODEL;
  }

  return {
    id: row.id == null ? `penny:${row.symbol}` : row.id,
    input: {
      symbol: row.symbol,
      name: row.name,
      market: row.market,
      price,
      marketCapUsd: null,
      avgDollarVolume20d: dollarVolume,
      floatShares: finiteOrNull(row.float_shares),
      rvol,
      floatRotation,
      spreadBps,
      gem,
      wave,
      catalyst,
      social,
      liquidity,
      trapRisk,
      peakRisk,
      confidence,
      dilutionRisk: null,
    },
    decision: {
      alpha,
      asymmetry,
      aggression,
      action,
      hardBlocked,
      reasons,
      suggestedRiskMultiplier: null,
    },
    state,
    observedAt: row.observed_at ?? row.market_observed_at,
    modelVersion,
    locked: stored,
  };
}

function positiveOrNull(value: number | null) {
  return value != null && value > 0 ? value : null;
}

function applyObservedPush<T extends ReturnType<typeof scorePennyRow>>(opportunity: T, push: PricePush, marketOutlook: number) {
  const catalystScore = observedCatalystScore(push);
  const socialScore = push.socialHype;
  const input = {
    ...opportunity.input,
    catalyst: catalystScore ?? positiveOrNull(opportunity.input.catalyst),
    social: displaySocialScore(push, positiveOrNull(opportunity.input.social)),
  };
  if (opportunity.locked || (catalystScore == null && socialScore == null && !push.blocksRoom)) {
    return { ...opportunity, input };
  }
  const decision = scoreOpportunity({
    symbol: String(input.symbol ?? ''),
    market: listingMarket(input.market),
    price: input.price ?? 0,
    marketCapUsd: 0,
    floatShares: input.floatShares ?? 0,
    avgDollarVolume20d: input.avgDollarVolume20d ?? 0,
    gem: input.gem,
    wave: input.wave,
    catalyst: catalystScore ?? 0,
    social: socialScore ?? 0,
    liquidity: input.liquidity,
    marketOutlook,
    reverseSplitRisk: 0,
    dilutionRisk: push.blocksRoom ? 70 : 0,
    promotionRisk: 0,
    trapRisk: input.trapRisk,
    peakRisk: input.peakRisk,
    confidence: input.confidence,
    state: 'DORMANT',
  });
  const extras = [
    catalystScore != null ? 'observed filing catalyst' : null,
    socialScore != null ? 'observed social attention' : null,
    push.blocksRoom ? 'recent financing registration' : null,
  ].filter((reason): reason is string => reason != null);
  return {
    ...opportunity,
    input,
    decision: {
      ...opportunity.decision,
      alpha: decision.alpha,
      asymmetry: decision.asymmetry,
      aggression: decision.aggression,
      action: decision.action,
      hardBlocked: decision.hardBlocked,
      reasons: [...new Set([...(opportunity.decision.reasons ?? []), ...decision.reasons, ...extras])],
    },
  };
}

export async function GET() {
  const sql = getSql();
  if (!sql) {
    const opportunities = sampleUniverse
      .map((input) => ({ input, decision: scoreOpportunity(input) }))
      .sort((a, b) => b.decision.asymmetry - a.decision.asymmetry);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      mode: 'sample',
      evidenceScope: 'sample',
      liveEvidenceOnly: false,
      opportunities,
    });
  }

  try {
    const [rows, regime] = await Promise.all([
      sql<any[]>`
      with latest_market as (
        select distinct on (m.security_id)
          m.security_id, s.symbol, s.name, s.market, m.price, m.dollar_volume, m.rvol, m.float_rotation, m.spread_bps,
          m.observed_at as market_observed_at, coalesce(m.payload->>'evidenceClass', 'live') as evidence_class
        from market_snapshots m
        join securities s on s.id = m.security_id
        where s.active = true and s.id not like 'validation:%'
        order by m.security_id, m.observed_at desc
      ), latest_opportunity as (
        select distinct on (o.security_id)
          o.id, o.security_id, o.state, o.alpha, o.gem, o.wave, o.asymmetry, o.catalyst, o.social, o.liquidity,
          o.trap_risk, o.peak_risk, o.confidence, o.aggression, o.action, o.hard_blocked, o.reasons, o.model_version, o.observed_at
        from opportunities o
        join securities s on s.id = o.security_id
        where s.active = true and s.id not like 'validation:%'
        order by o.security_id, o.observed_at desc
      ), latest_structure as (
        select distinct on (ss.security_id)
          ss.security_id, ss.float_shares
        from share_structures ss
        join securities s on s.id = ss.security_id
        where s.active = true and s.id not like 'validation:%'
          and ss.observed_at <= now()
        order by ss.security_id, ss.observed_at desc
      )
      select lm.*, lo.id, lo.state, lo.alpha, lo.gem, lo.wave, lo.asymmetry, lo.catalyst, lo.social, lo.liquidity,
             lo.trap_risk, lo.peak_risk, lo.confidence, lo.aggression, lo.action, lo.hard_blocked, lo.reasons,
             lo.model_version, lo.observed_at, ls.float_shares
      from latest_market lm
      left join latest_opportunity lo on lo.security_id = lm.security_id
      left join latest_structure ls on ls.security_id = lm.security_id
    `,
      runMarketRegimeWorkflow(),
    ]);

    const screened = rows.filter((row) => screenPennyStock({
      symbol: String(row.symbol ?? ''),
      price: row.price == null ? null : Number(row.price),
      dollarVolume: row.dollar_volume == null ? null : Number(row.dollar_volume),
      spreadBps: row.spread_bps == null ? null : Number(row.spread_bps),
    }).pass);
    const opportunities = screened
      .map((row) => scorePennyRow(row, regime.outlookScore))
      .sort((a, b) => b.decision.asymmetry - a.decision.asymmetry || b.decision.alpha - a.decision.alpha)
      .slice(0, 100);

    const symbols = opportunities.map((row) => String(row.input.symbol));
    const [histories, pushes] = await Promise.all([
      loadDailyHistory(symbols, 90),
      loadPricePush(symbols),
    ]);
    const withHistory = opportunities.map((opportunity) => {
      const symbol = String(opportunity.input.symbol).toUpperCase();
      const push = pushes.get(symbol) ?? EMPTY_PRICE_PUSH;
      const history = summarizePriceHistory(opportunity.input.price, histories.get(symbol) ?? []);
      return {
        ...applyObservedPush(opportunity, push, regime.outlookScore),
        push,
        history: { ...history, rise: applyPricePush(history.rise, push) },
      };
    });

    const analogs = symbols.flatMap((symbol) => collectForwardAnalogs(symbol, histories.get(symbol) ?? []));
    const candidates = withHistory.flatMap((row) => {
      const history = row.history;
      if (
        history.return5Pct == null
        || history.relativeVolume == null
        || history.extension20Pct == null
        || history.closeLocationPct == null
        || history.rise.score == null
      ) return [];
      return [{
        symbol: String(row.input.symbol).toUpperCase(),
        asOf: history.sessions[0]?.date ?? '',
        blocksRoom: Boolean(row.push?.blocksRoom),
        socialHype: row.push?.socialHype ?? null,
        setup: {
          return5Pct: history.return5Pct,
          relativeVolume: history.relativeVolume,
          extension20Pct: history.extension20Pct,
          closeLocationPct: history.closeLocationPct,
          room: history.rise.room,
          riseScore: history.rise.score,
        },
      }];
    });
    const dailyRank = rankDailyConsiderations(candidates, analogs);
    const projectionBySymbol = new Map(dailyRank.considered.map((row) => [row.symbol, row]));
    const rankedBook = withHistory.map((row) => ({
      ...row,
      projection: projectionBySymbol.get(String(row.input.symbol).toUpperCase()) ?? null,
    }));

    const evidence = summarizeOpportunityEvidence(rankedBook.map((row) => row.modelVersion));
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      mode: 'warehouse',
      evidenceScope: evidence.evidenceScope,
      liveEvidenceOnly: evidence.liveEvidenceOnly,
      liveCount: evidence.liveCount,
      referenceCount: evidence.referenceCount,
      count: rankedBook.length,
      dailyRank: {
        horizonSessions: dailyRank.horizonSessions,
        model: dailyRank.model,
        picks: dailyRank.picks,
      },
      pennyScreen: {
        maxPrice: PENNY_MAX_PRICE,
        minDollarVolume: PENNY_MIN_DOLLAR_VOLUME,
        considered: rows.length,
        admitted: screened.length,
      },
      opportunities: rankedBook,
    });
  } catch (error) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      mode: 'warehouse',
      evidenceScope: 'empty',
      liveEvidenceOnly: false,
      opportunities: [],
      error: 'opportunity_query_failed',
      detail: error instanceof Error ? error.message : 'unknown error',
    }, { status: 500 });
  }
}
