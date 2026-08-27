'use client';

import { useEffect, useState } from 'react';

type LabState = {
  signals: { count: number; families: string[] } | null;
  evidence: Record<string, any> | null;
  models: Record<string, any> | null;
  risk: Record<string, any> | null;
  portfolio: Record<string, any> | null;
  sources: Record<string, any> | null;
};

export function IntelligenceLab() {
  const [state, setState] = useState<LabState>({ signals: null, evidence: null, models: null, risk: null, portfolio: null, sources: null });

  useEffect(() => {
    Promise.all([
      fetch('/api/research/signals', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/performance/evidence', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/models/governance', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/risk/kill-switches', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/portfolio/shadow', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/research/source-reputation?limit=5', { cache: 'no-store' }).then((r) => r.json()),
    ]).then(([signals, evidence, models, risk, portfolio, sources]) => setState({ signals, evidence, models, risk, portfolio, sources }))
      .catch(() => undefined);
  }, []);

  const samples60 = Number(state.evidence?.samples?.m60 ?? 0);
  const avg60 = Number(state.evidence?.returns?.average60mPct ?? 0);
  const hit60 = Number(state.evidence?.returns?.hitRate60mPct ?? 0);
  const champions = Array.isArray(state.models?.champions) ? state.models.champions.length : 0;
  const challengers = Array.isArray(state.models?.challengers) ? state.models.challengers.length : 0;
  const criticalTrips = Number(state.risk?.criticalTrips ?? 0);
  const positions = Array.isArray(state.portfolio?.positions) ? state.portfolio.positions.length : 0;
  const sourceRows = Array.isArray(state.sources?.sources) ? state.sources.sources : [];

  return <section className="workspace" aria-label="Mercury intelligence lab">
    <div className="section-head">
      <div>
        <div className="eyebrow">Institutional research laboratory</div>
        <h2>Mercury Intelligence Lab</h2>
        <p>Signal provenance, realized evidence, model governance, source reputation, execution capacity, and independent survival controls.</p>
      </div>
      <span className="badge warn">SHADOW ONLY</span>
    </div>

    <div className="quad-grid">
      <div className="surface mini-panel"><h3>Alpha Factory</h3><div className="rule-stack"><div><span>Signal definitions</span><b>{state.signals?.count ?? 0}</b></div><div><span>Signal families</span><b>{state.signals?.families?.length ?? 0}</b></div></div></div>
      <div className="surface mini-panel"><h3>Outcome Evidence</h3><div className="rule-stack"><div><span>Matured 60m</span><b>{samples60}</b></div><div><span>60m hit rate</span><b>{hit60.toFixed(1)}%</b></div><div><span>Avg 60m return</span><b className={avg60 > 0 ? 'good' : avg60 < 0 ? 'danger' : ''}>{avg60.toFixed(2)}%</b></div></div></div>
      <div className="surface mini-panel"><h3>Model Governance</h3><div className="rule-stack"><div><span>Champions</span><b>{champions}</b></div><div><span>Challengers</span><b>{challengers}</b></div><div><span>Broker authority</span><b className="good">NONE</b></div></div></div>
      <div className="surface mini-panel"><h3>Survival Network</h3><div className="rule-stack"><div><span>Critical trips</span><b className={criticalTrips ? 'danger' : 'good'}>{criticalTrips}</b></div><div><span>Capital execution</span><b className="warn">LOCKED</b></div><div><span>Shadow positions</span><b>{positions}</b></div></div></div>
    </div>

    <div className="triple-grid">
      <div className="surface mini-panel"><h3>Top Source Reputation</h3>{sourceRows.length ? sourceRows.map((source: any) => <div className="source-row" key={`${source.source_type}:${source.source_ref}`}><span>{source.source_ref}<small>{source.source_type}</small></span><b>{source.reliability_score}</b><em>{source.observations} obs</em></div>) : <p className="muted2">Source reputation will populate after outcome-linked social observations mature.</p>}</div>
      <div className="surface mini-panel"><h3>Shadow Portfolio</h3><div className="rule-stack"><div><span>Positions</span><b>{positions}</b></div><div><span>Gross exposure</span><b>{Number(state.portfolio?.gross_exposure ?? state.portfolio?.grossExposure ?? 0).toLocaleString()}</b></div><div><span>Execution mode</span><b className="warn">SIMULATED</b></div></div></div>
      <div className="surface mini-panel"><h3>Evidence Ladder</h3><div className="rule-stack"><div><span>Research</span><b className="good">AUTONOMOUS</b></div><div><span>Paper review</span><b className="warn">GATED</b></div><div><span>Live capital</span><b className="warn">DISABLED</b></div></div></div>
    </div>
  </section>;
}
