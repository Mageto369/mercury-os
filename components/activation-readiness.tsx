'use client';

import { useEffect, useState } from 'react';
import { Activity, Database, Radio, RefreshCw, ShieldCheck } from 'lucide-react';

type Gate = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  status: 'ready' | 'partial' | 'blocked';
  detail: string;
};

type Readiness = {
  score: number;
  level: string;
  mode: 'shadow';
  capitalExecutionEnabled: false;
  blockers: string[];
  gates: Gate[];
  measuredAt: string;
};

const icons: Record<string, typeof Activity> = {
  database: Database,
  market: Radio,
  fleet: Activity,
  governance: ShieldCheck,
  providers: Radio,
};

export function ActivationReadiness() {
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/activation/readiness', { cache: 'no-store' });
      if (response.ok) setData(await response.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return <section className="surface jobs-panel" aria-label="Production readiness">
    <div className="section-head">
      <div>
        <div className="eyebrow">Activation control</div>
        <h2>Production Readiness</h2>
        <p>Objective infrastructure, freshness, fleet, governance, and provider gates.</p>
      </div>
      <button className="icon-button" aria-label="Refresh production readiness" onClick={() => void refresh()} disabled={loading}>
        <RefreshCw size={15} className={loading ? 'spin' : ''}/>
      </button>
    </div>

    <div className="kpi-strip" style={{ marginTop: 12 }}>
      <div className="kpi"><span>Readiness score</span><strong>{data?.score ?? 0}</strong><small>/ 100</small></div>
      <div className="kpi"><span>Operating level</span><strong className={data?.level === 'production-ready' ? 'good' : data?.level === 'shadow-ready' ? 'warn' : 'danger'}>{data?.level ?? 'checking'}</strong><small>shadow research only</small></div>
      <div className="kpi"><span>Hard blockers</span><strong>{data?.blockers.length ?? 0}</strong><small>{data?.blockers.join(', ') || 'none'}</small></div>
      <div className="kpi"><span>Capital execution</span><strong className="warn">LOCKED</strong><small>independent of readiness</small></div>
      <div className="kpi"><span>Mode</span><strong>SHADOW</strong><small>measured validation</small></div>
      <div className="kpi"><span>Measured</span><strong>{data ? new Date(data.measuredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}</strong><small>latest evaluation</small></div>
    </div>

    <div className="triple-grid" style={{ marginTop: 10 }}>
      {(data?.gates ?? []).map((gate) => {
        const Icon = icons[gate.key] ?? Activity;
        return <article className="surface mini-panel" key={gate.key}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon size={14}/>{gate.label}</h3>
          <div className="metric-row"><span>Status</span><div className="metric-meter"><i style={{ width: `${Math.round(100 * gate.score / gate.maxScore)}%` }}/></div><b className={gate.status === 'ready' ? 'good' : gate.status === 'partial' ? 'warn' : 'danger'}>{gate.status}</b></div>
          <div className="decision-copy">{gate.detail}</div>
        </article>;
      })}
    </div>
  </section>;
}
