import { createHash } from 'node:crypto';
import { getSql } from '@/lib/db';
import { countSurvivors, summarizeProvenance } from '@/lib/performance/provenance';
import { toJsonb } from '@/lib/db/json';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** A live proof gate needs a real sample before any of its other tests mean anything. */
export const PROOF_MINIMUM_SAMPLE = 1000;
const MAX_DRAWDOWN_FLOOR_PCT = -25;

type OutcomeRow = { r: number; security_id: string };

export async function evaluateEconomicProof() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured', capitalExecutionEnabled: false };

  // Pre-filter census. Counting candidates and synthetic rows separately from
  // the filtered evidence query is what makes the contamination check real:
  // the old gate wrote synthetic_rows = 0 as a literal, so it could never fail.
  const [census] = await sql`
    select
      count(*)::int as candidate_rows,
      count(*) filter (where s.id like 'validation:%')::int as synthetic_candidates
    from opportunity_outcomes oo
    join securities s on s.id = oo.security_id
    where oo.matured_60m
  `;

  const rows = await sql<OutcomeRow[]>`
    select oo.return_60m::float r, oo.security_id
    from opportunity_outcomes oo
    join securities s on s.id = oo.security_id
    where oo.matured_60m and s.id not like 'validation:%'
    order by oo.evaluated_at desc
    limit 5000
  `;

  // Survivors are counted from the rows actually used, not re-derived from the
  // predicate that produced them, so a regression in the filter is detectable.
  const survivors = countSurvivors(rows);
  const provenance = summarizeProvenance('live', {
    candidateRows: Number(census?.candidate_rows ?? 0),
    syntheticCandidates: Number(census?.synthetic_candidates ?? 0),
    syntheticSurviving: survivors.syntheticSurviving,
    liveSurviving: survivors.liveSurviving,
  });

  const returns = rows.map((row) => Number(row.r)).filter(Number.isFinite);
  const n = returns.length;
  const average = n ? returns.reduce((a, b) => a + b, 0) / n : 0;
  const sorted = [...returns].sort((a, b) => b - a);
  const cut = Math.max(1, Math.ceil(n * 0.01));
  const exTopWinners = n > cut ? sorted.slice(cut).reduce((a, b) => a + b, 0) / (n - cut) : 0;

  let equity = 100;
  let peak = 100;
  let drawdown = 0;
  for (const value of returns.slice().reverse()) {
    equity *= 1 + value / 100;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, (equity / peak - 1) * 100);
  }

  const reasons: string[] = [];
  if (n < PROOF_MINIMUM_SAMPLE) reasons.push('insufficient-live-sample');
  if (average <= 0) reasons.push('nonpositive-expectancy');
  if (exTopWinners <= 0) reasons.push('dependent-on-top-winners');
  if (drawdown < MAX_DRAWDOWN_FLOOR_PCT) reasons.push('drawdown-too-high');
  // Contamination is disqualifying regardless of how good the numbers look.
  if (!provenance.provenanceSafe) reasons.push('synthetic-evidence-contamination');

  const passed = reasons.length === 0;

  await sql`
    insert into economic_proof_gates
      (id, model_version, evidence_scope, sample_size, regimes, net_expectancy, max_drawdown,
       ex_top_winners_expectancy, synthetic_rows, passed, reasons, evaluated_at)
    values (
      ${hash(`proof:${new Date().toISOString().slice(0, 10)}`)}, 'alpha-factory-v2', 'live',
      ${n}, 1, ${average}, ${drawdown}, ${exTopWinners}, ${provenance.syntheticSurviving},
      ${passed}, ${toJsonb(reasons)}::jsonb, now()
    )
    on conflict (id) do update set
      sample_size = excluded.sample_size,
      net_expectancy = excluded.net_expectancy,
      max_drawdown = excluded.max_drawdown,
      ex_top_winners_expectancy = excluded.ex_top_winners_expectancy,
      synthetic_rows = excluded.synthetic_rows,
      passed = excluded.passed,
      reasons = excluded.reasons,
      evaluated_at = now()
  `;

  return {
    ok: true as const,
    evidenceScope: 'live' as const,
    sampleSize: n,
    minimumSampleSize: PROOF_MINIMUM_SAMPLE,
    sampleSufficient: n >= PROOF_MINIMUM_SAMPLE,
    netExpectancy: average,
    maxDrawdown: drawdown,
    exTopWinnersExpectancy: exTopWinners,
    provenance,
    passed,
    reasons,
    paperAutomationEligible: passed,
    capitalExecutionEnabled: false as const,
  };
}
