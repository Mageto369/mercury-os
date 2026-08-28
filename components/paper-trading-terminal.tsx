'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, FlaskConical, RefreshCw, ShieldCheck } from 'lucide-react';

type PaperOrder = {
  id: string;
  symbol: string;
  exchange?: string | null;
  side: string;
  requested_qty: string | number;
  filled_qty: string | number;
  requested_price?: string | number | null;
  average_fill_price?: string | number | null;
  status: string;
  latency_ms?: number | null;
  slippage_bps?: string | number | null;
  reject_reason?: string | null;
  created_at: string;
};

type TerminalData = {
  ok: boolean;
  mode: 'paper';
  capitalExecutionEnabled: false;
  brokerConnected?: false;
  evidenceScope?: string;
  error?: string;
  summary: { orders: number; filled: number; rejected: number; open: number };
  orders: PaperOrder[];
  latestPortfolioDecision?: Record<string, unknown> | null;
  account?: { available: boolean; reason?: string; nextFeature?: number };
};

export function PaperTradingTerminal() {
  const [data, setData] = useState<TerminalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview'|'orders'|'risk'>('overview');

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/paper/terminal', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      setData(body as TerminalData);
      if (!response.ok) setError(body.error ?? `HTTP ${response.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Paper terminal failed to load');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const orders = data?.orders ?? [];
  const statusTone = (status:string) => status === 'rejected' ? 'danger' : ['filled','simulated'].includes(status) ? 'good' : 'warn';
  const recent = useMemo(() => orders.slice(0, 12), [orders]);

  return <div className="paper-terminal">
    <section className="paper-hero surface">
      <div>
        <div className="eyebrow">Mercury execution research</div>
        <h1>Paper Trading Terminal</h1>
        <p>Simulated execution only. No brokerage connection and no real capital authority.</p>
      </div>
      <div className="paper-mode-badge"><FlaskConical size={16}/><div><b>PAPER MODE</b><small>REAL CAPITAL LOCKED</small></div></div>
    </section>

    <section className="paper-kpis">
      <div className="kpi"><span>Paper Orders</span><strong>{loading ? '…' : data?.summary?.orders ?? 0}</strong><small>live-only evidence</small></div>
      <div className="kpi"><span>Filled / Simulated</span><strong className="good">{loading ? '…' : data?.summary?.filled ?? 0}</strong><small>research ledger</small></div>
      <div className="kpi"><span>Open</span><strong className="warn">{loading ? '…' : data?.summary?.open ?? 0}</strong><small>pending simulation</small></div>
      <div className="kpi"><span>Rejected</span><strong className={data?.summary?.rejected ? 'danger' : ''}>{loading ? '…' : data?.summary?.rejected ?? 0}</strong><small>risk/execution rejects</small></div>
      <div className="kpi"><span>Broker</span><strong className="warn">OFF</strong><small>not connected</small></div>
      <div className="kpi"><span>Capital</span><strong className="warn">LOCKED</strong><small>execution disabled</small></div>
    </section>

    <div className="paper-toolbar">
      <div className="admin-tabs">
        {(['overview','orders','risk'] as const).map(item => <button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}
      </div>
      <button className="icon-button" onClick={()=>void load()} aria-label="Refresh paper trading"><RefreshCw size={16} className={loading?'spin':''}/></button>
    </div>

    {error && <div className="surface paper-warning"><b className="danger">Terminal warning:</b> {error}</div>}

    {tab==='overview' && <div className="paper-grid">
      <section className="surface paper-panel">
        <div className="section-head"><div><h2>Virtual Account</h2><p>Feature 2 in the build sequence.</p></div><Activity size={17}/></div>
        <div className="paper-empty"><b>Account ledger not enabled yet</b><span>Starting capital, cash, buying power, equity and P&amp;L will be added next. This terminal intentionally does not invent balances.</span></div>
      </section>
      <section className="surface paper-panel">
        <div className="section-head"><div><h2>Execution Boundary</h2><p>Current safety and evidence state.</p></div><ShieldCheck size={17}/></div>
        <div className="paper-facts"><div><span>Mode</span><b>PAPER</b></div><div><span>Broker connection</span><b>NONE</b></div><div><span>Capital execution</span><b>DISABLED</b></div><div><span>Evidence scope</span><b>{data?.evidenceScope ?? 'LIVE-ONLY'}</b></div></div>
      </section>
      <section className="surface paper-panel paper-wide">
        <div className="section-head"><div><h2>Recent Paper Activity</h2><p>Most recent non-validation paper-order records.</p></div></div>
        <OrderTable orders={recent} statusTone={statusTone}/>
      </section>
    </div>}

    {tab==='orders' && <section className="surface paper-panel"><div className="section-head"><div><h2>Paper Order Ledger</h2><p>Read-only in Feature 1. Order entry arrives as Feature 3.</p></div></div><OrderTable orders={orders} statusTone={statusTone}/></section>}

    {tab==='risk' && <div className="paper-grid"><section className="surface paper-panel"><h2>Risk Controls</h2><div className="paper-facts"><div><span>Real orders</span><b>BLOCKED</b></div><div><span>Broker routing</span><b>DISABLED</b></div><div><span>Validation rows</span><b>EXCLUDED</b></div><div><span>Promotion</span><b>EVIDENCE-GATED</b></div></div></section><section className="surface paper-panel"><h2>Latest Portfolio Decision</h2>{data?.latestPortfolioDecision?<pre className="report-json">{JSON.stringify(data.latestPortfolioDecision,null,2)}</pre>:<div className="paper-empty"><b>No portfolio decision yet</b><span>Mercury has not recorded a live shadow portfolio decision.</span></div>}</section></div>}
  </div>;
}

function OrderTable({orders,statusTone}:{orders:PaperOrder[];statusTone:(status:string)=>string}) {
  if (!orders.length) return <div className="paper-empty"><b>No paper orders yet</b><span>The terminal is connected to the ledger, but no live paper-order records exist.</span></div>;
  return <div className="table-scroll"><table className="command-table paper-orders"><thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Requested</th><th>Filled</th><th>Req. Price</th><th>Fill Price</th><th>Slippage</th><th>Latency</th><th>Status</th></tr></thead><tbody>{orders.map(order=><tr key={order.id}><td>{new Date(order.created_at).toLocaleString()}</td><td><b>{order.symbol}</b><small>{order.exchange ?? '—'}</small></td><td>{order.side}</td><td>{Number(order.requested_qty).toLocaleString()}</td><td>{Number(order.filled_qty).toLocaleString()}</td><td>{order.requested_price == null ? '—' : `$${Number(order.requested_price).toFixed(4)}`}</td><td>{order.average_fill_price == null ? '—' : `$${Number(order.average_fill_price).toFixed(4)}`}</td><td>{order.slippage_bps == null ? '—' : `${Number(order.slippage_bps).toFixed(2)} bps`}</td><td>{order.latency_ms == null ? '—' : `${order.latency_ms} ms`}</td><td><span className={`badge ${statusTone(order.status)}`}>{order.status.replaceAll('_',' ')}</span></td></tr>)}</tbody></table></div>;
}
