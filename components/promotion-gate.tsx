'use client';

import { useEffect, useState } from 'react';

type PromotionRule = { key: string; label: string; passed: boolean; detail: string };
type PromotionState = {
  mode: 'shadow';
  capitalExecutionEnabled: false;
  qualifiedForPaperReview: boolean;
  passedRules: number;
  totalRules: number;
  rules: PromotionRule[];
  readinessScore: number;
  evaluatedShadowDecisions: number;
};

export function PromotionGate() {
  const [state, setState] = useState<PromotionState | null>(null);

  useEffect(() => {
    fetch('/api/activation/promotion', { cache: 'no-store' })
      .then((response) => response.json())
      .then(setState)
      .catch(() => setState(null));
  }, []);

  return <section className="surface promotion-gate" aria-label="Shadow promotion gate">
    <div className="section-head">
      <div>
        <div className="eyebrow">Evidence gate</div>
        <h2>Shadow Promotion Gate</h2>
        <p>Mercury must earn stronger autonomy through measured results, not confidence scores alone.</p>
      </div>
      <div className={`badge ${state?.qualifiedForPaperReview ? 'good' : 'warn'}`}>
        {state?.qualifiedForPaperReview ? 'PAPER REVIEW ELIGIBLE' : 'SHADOW ONLY'}
      </div>
    </div>

    <div className="promotion-summary">
      <div><span>Rules passed</span><strong>{state ? `${state.passedRules}/${state.totalRules}` : '0/5'}</strong></div>
      <div><span>Readiness</span><strong>{state?.readinessScore ?? 0}/100</strong></div>
      <div><span>Shadow decisions</span><strong>{state?.evaluatedShadowDecisions ?? 0}</strong></div>
      <div><span>Capital execution</span><strong className="warn">LOCKED</strong></div>
    </div>

    <div className="promotion-rules">
      {(state?.rules ?? []).map((rule) => <div key={rule.key} className="promotion-rule">
        <span><b>{rule.label}</b><small>{rule.detail}</small></span>
        <em className={rule.passed ? 'good' : 'warn'}>{rule.passed ? 'PASS' : 'WAIT'}</em>
      </div>)}
      {!state && <div className="promotion-empty">Promotion evidence is loading.</div>}
    </div>
  </section>;
}
