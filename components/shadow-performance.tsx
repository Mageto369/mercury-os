'use client';

import { useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';

type Aggregate = { count: number; averageReturnPct: number; medianReturnPct: number; hitRatePct: number };
type Performance = {
  available: boolean;
  reason?: string;
  evaluated: number;
  matured15m?: number;
  matured60m?: number;
  horizons: { m15: Aggregate; m60: Aggregate };
  byAction: Record<string, { m15: Aggregate; m60: Aggregate }>;
  measuredAt?: string;
};

export function ShadowPerformance() {
  const [data, setData] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/performance/shadow', { cache: 'no-store' });
      if (response.ok) setData(await response.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  const h15 = data?.horizons.m15;
  const h60 = data?.horizons.m60;
  const topActions = Object.entries(data?.byAction ?? {})
    .sort(([, a], [, b]) => b.m60.averageReturnPct - a.m60.averageReturnPct)
    .slice(0, 5);

  return <section className="surface jobs-panel" aria-label="Shadow performance">
    <div className="section-head">
      <div>
        <div className="eyebrow">Evidence layer</div>
        <h2>Shadow Performance</h2>
        <p>Forward markouts from stored Mercury opportunities. No live capital involved.</p>
      </div>
      <button className="icon-button" aria-label="Refresh shadow performance" onClick={() => void refresh()} disabled={loading}>
        <RefreshCw size={15} className={loading ? 'spin' : ''}/>
      </button>
    </div>

    {!data?.available ? <div className="allocation-action"><span>Status</span><strong className="warn">NO PERFORMANCE DATA</strong><p>{data?.reason ?? 'Waiting for persistent warehouse data.'}</p></div> : <>
      <div className="kpi-strip" style={{ marginTop: 12 }}>
        <div className="kpi"><span>Opportunities reviewed</span><strong>{data.evaluated}</strong><small>30-day lookback</small></div>
        <div className="kpi"><span>15m avg return</span><strong className={(h15?.averageReturnPct ?? 0) >= 0 ? 'good' : 'danger'}>{(h15?.averageReturnPct ?? 0).toFixed(2)}%</strong><small>{h15?.count ?? 0} matured</small></div>
        <div className="kpi"><span>15m hit rate</span><strong>{(h15?.hitRatePct ?? 0).toFixed(1)}%</strong><small>positive markouts</small></div>
        <div className="kpi"><span>60m avg return</span><strong className={(h60?.averageReturnPct ?? 0) >= 0 ? 'good' : 'danger'}>{(h60?.averageReturnPct ?? 0).toFixed(2)}%</strong><small>{h60?.count ?? 0} matured</small></div>
        <div className="kpi"><span>60m hit rate</span><strong>{(h60?.hitRatePct ?? 0).toFixed(1)}%</strong><small>positive markouts</small></div>
        <div className="kpi"><span>Execution</span><strong className="warn">SHADOW</strong><small>capital locked</small></div>
      </div>

      <div className="triple-grid" style={{ marginTop: 10 }}>
        <article className="surface mini-panel">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><BarChart3 size={14}/>15-minute markout</h3>
          <div className="rule-stack"><div><span>Average</span><b>{(h15?.averageReturnPct ?? 0).toFixed(2)}%</b></div><div><span>Median</span><b>{(h15?.medianReturnPct ?? 0).toFixed(2)}%</b></div><div><span>Hit rate</span><b>{(h15?.hitRatePct ?? 0).toFixed(1)}%</b></div></div>
        </article>
        <article className="surface mini-panel">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><BarChart3 size={14}/>60-minute markout</h3>
          <div className="rule-stack"><div><span>Average</span><b>{(h60?.averageReturnPct ?? 0).toFixed(2)}%</b></div><div><span>Median</span><b>{(h60?.medianReturnPct ?? 0).toFixed(2)}%</b></div><div><span>Hit rate</span><b>{(h60?.hitRatePct ?? 0).toFixed(1)}%</b></div></div>
        </article>
        <article className="surface mini-panel">
          <h3>Best actions by 60m markout</h3>
          <div className="rule-stack">{topActions.length ? topActions.map(([action, metric]) => <div key={action}><span>{action}</span><b>{metric.m60.averageReturnPct.toFixed(2)}%</b></div>) : <div><span>Waiting</span><b>0 matured</b></div>}</div>
        </article>
      </div>
    </>}
  </section>;
}
