import { getProductionReadiness } from '@/lib/activation/readiness';
import { getShadowPerformance } from '@/lib/performance/shadow';

export async function evaluateShadowPromotion(){
 const [readiness,performance]=await Promise.all([getProductionReadiness(),getShadowPerformance('live')]);
 const provenanceSafe=performance.available&&performance.liveEvidenceOnly&&performance.syntheticRows===0&&performance.provenanceSafe;
 const rules=[
  {key:'provenance',label:'Live evidence provenance',passed:provenanceSafe,detail:performance.available?`LIVE EVIDENCE ONLY. Synthetic validation rows: ${performance.syntheticRows}.`:'Persistent performance history unavailable.'},
  {key:'readiness',label:'Shadow infrastructure readiness',passed:readiness.score>=65&&!readiness.blockers.includes('database')&&!readiness.blockers.includes('market'),detail:`Readiness score ${readiness.score}/100, blockers: ${readiness.blockers.join(', ')||'none'}.`},
  {key:'sample-size',label:'Matured live shadow sample',passed:performance.available&&provenanceSafe&&performance.matured60m>=50,detail:performance.available?`${performance.matured60m} LIVE decisions have 60-minute markouts.`:'Persistent performance history unavailable.'},
  {key:'hit-rate',label:'Positive live 60-minute hit rate',passed:performance.available&&provenanceSafe&&performance.horizons.m60.hitRatePct>=55,detail:performance.available?`LIVE 60-minute hit rate ${performance.horizons.m60.hitRatePct}%.`:'No measurable hit rate.'},
  {key:'expected-return',label:'Positive live 60-minute average return',passed:performance.available&&provenanceSafe&&performance.horizons.m60.averageReturnPct>0,detail:performance.available?`LIVE 60-minute average markout ${performance.horizons.m60.averageReturnPct}%.`:'No measurable average return.'},
  {key:'governance',label:'Capital lock remains enforced',passed:readiness.capitalExecutionEnabled===false,detail:'Capital execution must remain locked during promotion review.'},
 ];
 const passedRules=rules.filter(r=>r.passed).length,qualifiedForPaperReview=rules.every(r=>r.passed);
 return{mode:'shadow' as const,evidenceScope:'live' as const,liveEvidenceOnly:true as const,syntheticRows:performance.available?performance.syntheticRows:0,provenanceSafe,capitalExecutionEnabled:false as const,qualifiedForPaperReview,passedRules,totalRules:rules.length,rules,readinessScore:readiness.score,evaluatedShadowDecisions:performance.available?performance.evaluated:0,measuredAt:new Date().toISOString()};
}
