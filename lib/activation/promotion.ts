import { getProductionReadiness } from '@/lib/activation/readiness';
import { getShadowPerformance } from '@/lib/performance/shadow';

export async function evaluateShadowPromotion() {
  const [readiness, performance] = await Promise.all([
    getProductionReadiness(),
    getShadowPerformance(),
  ]);

  const rules = [
    {
      key: 'readiness',
      label: 'Shadow infrastructure readiness',
      passed: readiness.score >= 65 && !readiness.blockers.includes('database') && !readiness.blockers.includes('market'),
      detail: `Readiness score ${readiness.score}/100, blockers: ${readiness.blockers.join(', ') || 'none'}.`,
    },
    {
      key: 'sample-size',
      label: 'Matured shadow sample',
      passed: performance.available && performance.matured60m >= 50,
      detail: performance.available ? `${performance.matured60m} decisions have 60-minute markouts.` : 'Persistent performance history unavailable.',
    },
    {
      key: 'hit-rate',
      label: 'Positive 60-minute hit rate',
      passed: performance.available && performance.horizons.m60.hitRatePct >= 55,
      detail: performance.available ? `60-minute hit rate ${performance.horizons.m60.hitRatePct}%.` : 'No measurable hit rate.',
    },
    {
      key: 'expected-return',
      label: 'Positive 60-minute average return',
      passed: performance.available && performance.horizons.m60.averageReturnPct > 0,
      detail: performance.available ? `60-minute average markout ${performance.horizons.m60.averageReturnPct}%.` : 'No measurable average return.',
    },
    {
      key: 'governance',
      label: 'Capital lock remains enforced',
      passed: readiness.capitalExecutionEnabled === false,
      detail: 'Capital execution must remain locked during promotion review.',
    },
  ];

  const passedRules = rules.filter((rule) => rule.passed).length;
  const qualifiedForPaperReview = rules.every((rule) => rule.passed);

  return {
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
    qualifiedForPaperReview,
    passedRules,
    totalRules: rules.length,
    rules,
    readinessScore: readiness.score,
    evaluatedShadowDecisions: performance.available ? performance.evaluated : 0,
    measuredAt: new Date().toISOString(),
  };
}
