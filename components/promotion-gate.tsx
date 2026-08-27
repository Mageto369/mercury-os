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

  return <section className="autonomy-wrap" aria-label="Shadow promotion gate">
    <div className="autonomy-head">
      <div>
        <div className="eyebrow">Evidence gate</div>
        <h2>Shadow Promotion Gate</h2>
        <p>Mercury must earn stronger autonomy through measured results, not confidence scores alone.</p>
      </div>
      <div className={`badge ${state?.qualifiedForPaperReview ? 'good' : 'warn'}`}>
        {state?.qualifiedForPaperReview ? 'PAPER REVIEW ELIGIBLE' : 'SHADOW ONLY'}
      </div>
    </div>

    <div className="autonomy-kpis">
      <div><span>Rules passed</span><strong>{state ? `${state.passedRules}/${state.totalRules}` : '0/5'}</strong></div>
      <div><span>Readiness</span><strong>{state?.readinessScore ?? 0}/100</strong></div>
      <div><span>Shadow decisions</span><strong>{state?.evaluatedShadowDecisions ?? 0}</strong></div>
      <div><span>Capital execution</span><strong className="warn">LOCKED</strong></div>
    </div>

    <div className="autonomy-grid">
      <div className="autonomy-panel event-stream">
        <div className="autonomy-panel-title"><h3>Promotion Criteria</h3><small>{state?.qualifiedForPaperReview ? 'eligible for review' : 'shadow evidence incomplete'}</small></div>
        <div className="event-list">
          {(state?.rules ?? []).map((rule) => <div key={rule.key} className="event-row">
            <span><b>{rule.label}</b><small>{rule.detail}</small></span>
            <p>{rule.passed ? 'Evidence threshold satisfied.' : 'More evidence required.'}</p>
            <em className={rule.passed ? 'good' : 'warn'}>{rule.passed ? 'PASS' : 'WAIT'}</em>
          </div>)}
          {!state && <div className="event-empty">Promotion evidence is loading.</div>}
        </div>
      </div>
    </div>
  </section>;
}
