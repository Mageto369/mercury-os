import { expect, test } from '@playwright/test';
import { countSurvivors, isValidationId, summarizeProvenance } from '../../lib/performance/provenance';

test('validation identifiers are recognised by prefix', () => {
  expect(isValidationId('validation:stress:1')).toBe(true);
  expect(isValidationId('sec:AAPL')).toBe(false);
  expect(isValidationId(null)).toBe(false);
  expect(isValidationId(undefined)).toBe(false);
});

test('survivors are counted from the rows actually used', () => {
  const counts = countSurvivors([
    { security_id: 'sec:AAA' },
    { security_id: 'validation:stress:1' },
    { securityId: 'sec:BBB' },
  ]);
  expect(counts.liveSurviving).toBe(2);
  expect(counts.syntheticSurviving).toBe(1);
});

test('a clean result with no synthetic data present is reported as unproven, not as a pass', () => {
  // This is the case the old tautological detector could not distinguish: it
  // always answered "safe" whether or not filtering had done anything.
  const audit = summarizeProvenance('live', {
    candidateRows: 500,
    syntheticCandidates: 0,
    syntheticSurviving: 0,
    liveSurviving: 500,
  });
  expect(audit.provenanceSafe).toBe(true);
  expect(audit.vacuous).toBe(true);
  expect(audit.filteringObserved).toBe(false);
  expect(audit.contaminationReasons.join(' ')).toContain('does not by itself demonstrate');
});

test('filtering that actually removed rows is reported as observed', () => {
  const audit = summarizeProvenance('live', {
    candidateRows: 500,
    syntheticCandidates: 40,
    syntheticSurviving: 0,
    liveSurviving: 460,
  });
  expect(audit.syntheticExcluded).toBe(40);
  expect(audit.filteringObserved).toBe(true);
  expect(audit.vacuous).toBe(false);
  expect(audit.provenanceSafe).toBe(true);
  expect(audit.contaminationReasons).toEqual([]);
});

test('synthetic rows surviving into a live set is flagged as contamination', () => {
  const audit = summarizeProvenance('live', {
    candidateRows: 500,
    syntheticCandidates: 40,
    syntheticSurviving: 3,
    liveSurviving: 457,
  });
  expect(audit.provenanceSafe).toBe(false);
  expect(audit.syntheticSurviving).toBe(3);
  expect(audit.syntheticExcluded).toBe(37);
  expect(audit.contaminationReasons.join(' ')).toContain('did not hold');
});

test('an empty live result set is called out rather than reported as clean', () => {
  const audit = summarizeProvenance('live', {
    candidateRows: 25,
    syntheticCandidates: 25,
    syntheticSurviving: 0,
    liveSurviving: 0,
  });
  expect(audit.liveSurviving).toBe(0);
  expect(audit.contaminationReasons.join(' ')).toContain('No live rows survived');
});

test('scope "all" admits synthetic rows but marks the set unusable as proof', () => {
  const audit = summarizeProvenance('all', {
    candidateRows: 100,
    syntheticCandidates: 10,
    syntheticSurviving: 10,
    liveSurviving: 90,
  });
  expect(audit.liveEvidenceOnly).toBe(false);
  expect(audit.provenanceSafe).toBe(true);
  expect(audit.contaminationReasons.join(' ')).toContain('must not be used as market proof');
});

test('counts are clamped so a malformed census cannot produce negative evidence', () => {
  const audit = summarizeProvenance('live', {
    candidateRows: -5,
    syntheticCandidates: -1,
    syntheticSurviving: -2,
    liveSurviving: -3,
  });
  expect(audit.candidateRows).toBe(0);
  expect(audit.syntheticExcluded).toBe(0);
  expect(audit.syntheticSurviving).toBe(0);
});
