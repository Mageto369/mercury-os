import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { scoreOpportunity } from '@/lib/alpha/scoring';
import { sampleUniverse } from '@/lib/intelligence/sample-universe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sql = getSql();
  if (!sql) {
    const opportunities = sampleUniverse
      .map((input) => ({ input, decision: scoreOpportunity(input) }))
      .sort((a, b) => b.decision.asymmetry - a.decision.asymmetry);
    return NextResponse.json({ generatedAt: new Date().toISOString(), mode: 'sample', liveEvidenceOnly: false, opportunities });
  }

  try {
    const rows = await sql<any[]>`
      with latest_opportunity as (
        select distinct on (o.security_id)
          o.*, s.symbol, s.name, s.market
        from opportunities o
        join securities s on s.id = o.security_id
        where s.active = true and s.id not like 'validation:%'
        order by o.security_id, o.observed_at desc
      ), latest_market as (
        select distinct on (m.security_id)
          m.security_id, m.price, m.dollar_volume, m.rvol, m.float_rotation, m.spread_bps, m.observed_at
        from market_snapshots m
        join securities s on s.id = m.security_id
        where s.active = true and s.id not like 'validation:%'
        order by m.security_id, m.observed_at desc
      ), latest_structure as (
        select distinct on (ss.security_id)
          ss.security_id, ss.float_shares, ss.outstanding_shares, ss.authorized_shares, ss.observed_at
        from share_structures ss
        join securities s on s.id = ss.security_id
        where s.active = true and s.id not like 'validation:%'
        order by ss.security_id, ss.observed_at desc
      )
      select lo.*, lm.price, lm.dollar_volume, lm.rvol, lm.float_rotation, lm.spread_bps,
             ls.float_shares, ls.outstanding_shares, ls.authorized_shares
      from latest_opportunity lo
      left join latest_market lm on lm.security_id = lo.security_id
      left join latest_structure ls on ls.security_id = lo.security_id
      order by lo.asymmetry desc, lo.alpha desc
      limit 100
    `;

    const opportunities = rows.map((row) => ({
      id: row.id,
      input: {
        symbol: row.symbol,
        name: row.name,
        market: row.market,
        price: row.price == null ? null : Number(row.price),
        marketCapUsd: null,
        avgDollarVolume20d: row.dollar_volume == null ? null : Number(row.dollar_volume),
        floatShares: row.float_shares == null ? null : Number(row.float_shares),
        rvol: row.rvol == null ? null : Number(row.rvol),
        floatRotation: row.float_rotation == null ? null : Number(row.float_rotation),
        spreadBps: row.spread_bps == null ? null : Number(row.spread_bps),
        gem: row.gem,
        wave: row.wave,
        catalyst: row.catalyst,
        social: row.social,
        liquidity: row.liquidity,
        trapRisk: row.trap_risk,
        peakRisk: row.peak_risk,
        confidence: row.confidence,
        dilutionRisk: null,
      },
      decision: {
        alpha: row.alpha,
        asymmetry: row.asymmetry,
        aggression: row.aggression,
        action: row.action,
        hardBlocked: row.hard_blocked,
        reasons: Array.isArray(row.reasons) ? row.reasons : [],
        suggestedRiskMultiplier: null,
      },
      state: row.state,
      observedAt: row.observed_at,
      modelVersion: row.model_version,
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      mode: 'live',
      liveEvidenceOnly: true,
      count: opportunities.length,
      opportunities,
    });
  } catch (error) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      mode: 'live',
      liveEvidenceOnly: true,
      opportunities: [],
      error: 'opportunity_query_failed',
      detail: error instanceof Error ? error.message : 'unknown error',
    }, { status: 500 });
  }
}
