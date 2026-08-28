/**
 * Evidence provenance auditing.
 *
 * The previous "synthetic rows" counters were tautological: they counted
 * `validation:%` rows inside a query whose WHERE clause had already excluded
 * them, so the answer was always 0 and the detector could never fire.
 *
 * Real monitoring needs four independent numbers:
 *   - candidateRows      how many rows existed before any provenance filter
 *   - syntheticExcluded  how many were removed for being synthetic/validation
 *   - liveSurviving      how many live rows the filter admitted
 *   - syntheticSurviving counted from the rows actually used, so a regression
 *                        in the filter is detected rather than assumed away
 *
 * `syntheticSurviving` is the only figure that indicates contamination. The
 * other three are what prove the filter actually ran.
 */

export const VALIDATION_ID_PREFIX = 'validation:';

export type EvidenceScope = 'live' | 'validation' | 'all';

export interface ProvenanceCounts {
  /** Rows matching the analytical window before any provenance filter. */
  candidateRows: number;
  /** Synthetic/validation rows present among the candidates. */
  syntheticCandidates: number;
  /** Synthetic/validation rows observed in the rows actually used downstream. */
  syntheticSurviving: number;
  /** Live rows observed in the rows actually used downstream. */
  liveSurviving: number;
}

export interface ProvenanceAudit extends ProvenanceCounts {
  scope: EvidenceScope;
  liveEvidenceOnly: boolean;
  /** Synthetic rows the filter removed. */
  syntheticExcluded: number;
  /** True when no synthetic row reached the evidence set for this scope. */
  provenanceSafe: boolean;
  /** True when synthetic rows existed and were demonstrably filtered out. */
  filteringObserved: boolean;
  /**
   * True when the check is vacuous: no synthetic data existed at all, so a
   * clean result proves nothing about the filter. Distinguishing this from a
   * real pass is the whole point of this module.
   */
  vacuous: boolean;
  contaminationReasons: string[];
  measuredAt: string;
}

export function isValidationId(id: string | null | undefined) {
  return typeof id === 'string' && id.startsWith(VALIDATION_ID_PREFIX);
}

/**
 * Build an audit from raw counts. Pure, so it is directly testable and shared
 * by every evidence surface.
 */
export function summarizeProvenance(scope: EvidenceScope, counts: ProvenanceCounts): ProvenanceAudit {
  const candidateRows = Math.max(0, counts.candidateRows);
  const syntheticCandidates = Math.max(0, counts.syntheticCandidates);
  const syntheticSurviving = Math.max(0, counts.syntheticSurviving);
  const liveSurviving = Math.max(0, counts.liveSurviving);
  const syntheticExcluded = Math.max(0, syntheticCandidates - syntheticSurviving);

  const reasons: string[] = [];

  if (scope === 'live' && syntheticSurviving > 0) {
    reasons.push(`${syntheticSurviving} synthetic row(s) reached a live-only evidence set; the provenance filter did not hold.`);
  }
  if (scope === 'all' && syntheticSurviving > 0) {
    reasons.push(`Scope "all" intentionally mixes ${syntheticSurviving} synthetic row(s) with live evidence; this set must not be used as market proof.`);
  }
  if (candidateRows > 0 && liveSurviving === 0 && scope === 'live') {
    reasons.push('No live rows survived the provenance filter, so any statistic derived from this set is empty rather than clean.');
  }

  const provenanceSafe = scope === 'live' ? syntheticSurviving === 0 : true;
  const filteringObserved = syntheticExcluded > 0;
  const vacuous = scope === 'live' && syntheticCandidates === 0;

  if (vacuous && candidateRows > 0) {
    reasons.push('No synthetic rows exist in this window, so a clean result does not by itself demonstrate that filtering works.');
  }

  return {
    scope,
    liveEvidenceOnly: scope === 'live',
    candidateRows,
    syntheticCandidates,
    syntheticExcluded,
    syntheticSurviving,
    liveSurviving,
    provenanceSafe,
    filteringObserved,
    vacuous,
    contaminationReasons: reasons,
    measuredAt: new Date().toISOString(),
  };
}

/**
 * Count survivors directly from the rows handed downstream, rather than
 * re-deriving them from the same predicate that produced the set.
 */
export function countSurvivors(rows: ReadonlyArray<Record<string, unknown>>) {
  let syntheticSurviving = 0;
  let liveSurviving = 0;
  for (const row of rows) {
    const id = (row.security_id ?? row.securityId) as string | null | undefined;
    if (isValidationId(id)) syntheticSurviving += 1;
    else liveSurviving += 1;
  }
  return { syntheticSurviving, liveSurviving };
}
