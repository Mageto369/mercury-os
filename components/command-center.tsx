'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bell, BrainCircuit, Database, Gauge, Radar, RefreshCw, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { ActivationReadiness } from '@/components/activation-readiness';
import { AgentFleet } from '@/components/agent-fleet';
import { AutonomyConsole } from '@/components/autonomy-console';
import { IntelligenceLab } from '@/components/intelligence-lab';
import { LiveWarehousePanel } from '@/components/live-warehouse-panel';
import { PromotionGate } from '@/components/promotion-gate';
import { ShadowPerformance } from '@/components/shadow-performance';

type Opportunity = {
  id?: string;
  input: {
    symbol: string;
    name?: string | null;
    market: string;
    price?: number | null;
    gem: number;
    wave: number;
    catalyst: number;
    social: number;
    liquidity: number;
    trapRisk: number;
    peakRisk: number;
    confidence: number;
    floatShares?: number | null;
    avgDollarVolume20d?: number | null;
  };
  decision: {
    alpha: number;
    asymmetry: number;
    aggression: number;
    action: string;
    hardBlocked: boolean;
    reasons?: string[];
  };
  state?: string;
  observedAt?: string;
};

type DashboardState = {
  opportunities: Opportunity[];
  opportunityMode: string;
  regime: any;
  liquidity: any;
  agents: any;
  autonomy: any;
  providers: any;
  error: string | null;
};

const emptyState: DashboardState = {
  opportunities: [], opportunityMode: 'loading', regime: null, liquidity: null,
  agents: null, autonomy: null, providers: null, error: null,
};

const nav = ['Command', 'Market Outlook', 'Discovery', 'Social Radar', 'Opportunities', 'Portfolio', 'Risk', 'Research', 'Models', 'Workflows', 'Audit'] as const;
type Workspace = typeof nav[number];

function n(value: unknown, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function display(value: unknown, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

export function CommandCenter() {
  const [tab, setTab] = useState<Workspace>('Command');
  const [state, setState] = useState<DashboardState>(emptyState);
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<'asymmetry' | 'alpha' | 'gem' | 'wave'>('asymmetry');
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const paths = [
        '/api/opportunities', '/api/market/regime', '/api/market/liquidity',
        '/api/agents/health', '/api/autonomy/status', '/api/providers/market/status',
      ];
      const responses = await Promise.all(paths.map((path) => fetch(path, { cache: 'no-store' })));
      const bodies = await Promise.all(responses.map(async (response) => ({ ok: response.ok, body: await response.json().catch(() => ({})) })));
      const [opportunities, regime, liquidity, agents, autonomy, providers] = bodies;
      const items = Array.isArray(opportunities.body?.opportunities) ? opportunities.body.opportunities : [];
      setState({
        opportunities: items,
        opportunityMode: opportunities.body?.mode ?? 'unknown',
        regime: regime.body,
        liquidity: liquidity.body,
        agents: agents.body,
        autonomy: autonomy.body,
        providers: providers.body,
        error: bodies.some((item) => !item.ok) ? 'One or more dashboard services reported an error.' : null,
      });
      if (!selected && items.length) setSelected(items[0].input.symbol);
      setAlerts(bodies.filter((item) => !item.ok).length);
      setLastRefresh(new Date().toISOString());
      setRefreshToken((v) => v + 1);
    } catch (error) {
      setState((previous) => ({ ...previous, error: error instanceof Error ? error.message : 'Dashboard refresh failed.' }));
      setAlerts((v) => Math.max(1, v));
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  async function runPulse() {
    setRunning(true);
    try {
      const response = await fetch('/api/control/pulse', { method: 'POST' });
      if (!response.ok) throw new Error(`Pulse failed with HTTP ${response.status}`);
      await loadDashboard();
    } catch (error) {
      setState((previous) => ({ ...previous, error: error instanceof Error ? error.message : 'Pulse failed.' }));
      setAlerts((v) => Math.max(1, v));
    } finally {
      setRunning(false);
    }
  }

  const ranked = useMemo(() => [...state.opportunities].sort((a, b) => {
    if (sort === 'alpha') return b.decision.alpha - a.decision.alpha;
    if (sort === 'gem') return b.input.gem - a.input.gem;
    if (sort === 'wave') return b.input.wave - a.input.wave;
    return b.decision.asymmetry - a.decision.asymmetry;
  }), [state.opportunities, sort]);

  const current = ranked.find((item) => item.input.symbol === selected) ?? ranked[0] ?? null;
  const regimeName = state.regime?.regime ?? state.autonomy?.regime ?? null;
  const systemHealth = state.agents?.summary?.healthScore ?? state.agents?.healthScore ?? null;
  const providerReady = state.providers?.readyProviders ?? state.providers?.configuredProviders ?? null;
  const alphaQueue = ranked.filter((item) => !item.decision.hardBlocked).length;
  const bestAsymmetry = ranked.length ? Math.max(...ranked.map((item) => item.decision.asymmetry)) : null;

  const iconMap: Record<string, React.ReactNode> = {
    Command: <Gauge size={16}/>, 'Market Outlook': <TrendingUp size={16}/>, Discovery: <Sparkles size={16}/>,
    'Social Radar': <Radar size={16}/>, Risk: <ShieldCheck size={16}/>, Models: <BrainCircuit size={16}/>,
    Workflows: <Activity size={16}/>, Audit: <Database size={16}/>,
  };

  return <div className="app-shell">
    <aside className="sidebar2">
      <div className="brand2"><div className="logo-mark">M</div><div><b>MERCURY OS</b><small>Institutional Alpha Intelligence</small></div></div>
      <nav>{nav.map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? 'nav-btn active' : 'nav-btn'}>{iconMap[item] ?? <span className="nav-dot"/>}<span>{item}</span></button>)}</nav>
      <div className="sidebar-foot"><span className="live-dot"/> SHADOW MODE<div className="tiny">Capital execution disabled</div></div>
    </aside>

    <main className="workspace">
      <header className="command-header">
        <div><div className="eyebrow">{tab} workspace</div><h1>{tab === 'Command' ? 'Calculated Aggression' : tab}</h1><p>{state.opportunityMode === 'live' ? 'LIVE EVIDENCE ONLY · Supabase-backed research state' : state.opportunityMode === 'sample' ? 'Sample mode · database runtime not connected' : 'Research and shadow operations'}</p></div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setAlerts(0)} aria-label="Clear alerts"><Bell size={17}/>{alerts > 0 && <span>{alerts}</span>}</button>
          <button className="pulse-button" onClick={runPulse} disabled={running}><RefreshCw size={16} className={running ? 'spin' : ''}/>{running ? 'Scanning' : 'Run Intelligence Pulse'}</button>
        </div>
      </header>

      {state.error && <div className="surface" style={{padding:12, marginBottom:12}}><b className="danger">Dashboard service warning:</b> {state.error}</div>}

      {tab === 'Command' && <>
        <section className="kpi-strip">
          {[
            ['Market Regime', display(regimeName), regimeName ? 'good' : 'warn'],
            ['Live Opportunities', String(ranked.length), ranked.length ? 'good' : 'warn'],
            ['Alpha Queue', String(alphaQueue), alphaQueue ? 'good' : 'warn'],
            ['Best Asymmetry', display(bestAsymmetry), bestAsymmetry !== null ? 'good' : 'warn'],
            ['Providers Ready', display(providerReady), providerReady ? 'good' : 'warn'],
            ['System Health', display(systemHealth), systemHealth ? 'good' : 'warn'],
          ].map(([label, value, tone]) => <div className="kpi" key={label}><span>{label}</span><strong className={tone}>{loading ? '…' : value}</strong><small>{state.opportunityMode === 'live' ? 'live warehouse' : 'runtime status'}</small></div>)}
        </section>

        <section className="hero-grid">
          <StatusPanel title="Market Regime" route="/api/market/regime" refreshToken={refreshToken}/>
          <StatusPanel title="Liquidity / Microstructure" route="/api/market/liquidity" refreshToken={refreshToken}/>
        </section>

        <OpportunityTable ranked={ranked} selected={selected} setSelected={setSelected} sort={sort} setSort={setSort}/>
        {current ? <OpportunityDetail opportunity={current}/> : <EmptyPanel title="No live opportunities" detail="The dashboard is connected, but no live non-validation opportunity rows are available yet. Run ingestion/intelligence workflows to populate this view."/>}

        <section className="triple-grid">
          <StatusPanel title="Agent Health" route="/api/agents/health" refreshToken={refreshToken}/>
          <StatusPanel title="Provider Fabric" route="/api/providers/market/status" refreshToken={refreshToken}/>
          <StatusPanel title="Autonomy State" route="/api/autonomy/status" refreshToken={refreshToken}/>
        </section>
        {lastRefresh && <div className="tiny" style={{marginTop:10}}>Last refreshed {new Date(lastRefresh).toLocaleString()}</div>}
      </>}

      {tab === 'Market Outlook' && <section className="triple-grid"><StatusPanel title="Regime" route="/api/market/regime" refreshToken={refreshToken}/><StatusPanel title="Liquidity" route="/api/market/liquidity" refreshToken={refreshToken}/><StatusPanel title="Market Providers" route="/api/providers/market/status" refreshToken={refreshToken}/></section>}
      {tab === 'Discovery' && <><StatusPanel title="Gem Discovery" route="/api/gems" refreshToken={refreshToken}/><OpportunityTable ranked={ranked} selected={selected} setSelected={setSelected} sort={sort} setSort={setSort}/></>}
      {tab === 'Social Radar' && <section className="hero-grid"><StatusPanel title="Social Trends" route="/api/social/trends" refreshToken={refreshToken}/><StatusPanel title="Source Reputation" route="/api/research/source-reputation?limit=10" refreshToken={refreshToken}/></section>}
      {tab === 'Opportunities' && <><OpportunityTable ranked={ranked} selected={selected} setSelected={setSelected} sort={sort} setSort={setSort}/>{current && <OpportunityDetail opportunity={current}/>}</>}
      {tab === 'Portfolio' && <><ShadowPerformance/><PromotionGate/><StatusPanel title="Shadow Portfolio" route="/api/portfolio/shadow" refreshToken={refreshToken}/></>}
      {tab === 'Risk' && <><StatusPanel title="Kill Switches" route="/api/risk/kill-switches" refreshToken={refreshToken}/><IntelligenceLab/></>}
      {tab === 'Research' && <><StatusPanel title="Research Proof" route="/api/integrations/research-proof" refreshToken={refreshToken}/><StatusPanel title="Historical Research" route="/api/research/history" refreshToken={refreshToken}/><IntelligenceLab/></>}
      {tab === 'Models' && <><StatusPanel title="Model Governance" route="/api/models/governance" refreshToken={refreshToken}/><StatusPanel title="Deep Intelligence" route="/api/intelligence/deep" refreshToken={refreshToken}/><IntelligenceLab/></>}
      {tab === 'Workflows' && <><AutonomyConsole/><AgentFleet/></>}
      {tab === 'Audit' && <><ActivationReadiness/><LiveWarehousePanel/><StatusPanel title="Recent System Events" route="/api/events/recent" refreshToken={refreshToken}/></>}
    </main>
  </div>;
}

function OpportunityTable({ ranked, selected, setSelected, sort, setSort }: {
  ranked: Opportunity[]; selected: string | null; setSelected: (value: string) => void;
  sort: 'asymmetry' | 'alpha' | 'gem' | 'wave'; setSort: (value: 'asymmetry' | 'alpha' | 'gem' | 'wave') => void;
}) {
  return <section className="surface opportunity-card">
    <div className="section-head"><div><h2>Opportunity Command</h2><p>Live-only ranked opportunity rows when the database runtime is connected.</p></div><select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="asymmetry">Asymmetry</option><option value="alpha">Alpha</option><option value="gem">Gem</option><option value="wave">Wave</option></select></div>
    {ranked.length === 0 ? <div className="muted2" style={{padding:'18px 0'}}>No live opportunity rows available.</div> : <div className="table-scroll"><table className="command-table"><thead><tr><th>Ticker</th><th>Alpha</th><th>Gem</th><th>Wave</th><th>Asym.</th><th>Catalyst</th><th>Social</th><th>Liquidity</th><th>Trap</th><th>Peak</th><th>Aggr.</th><th>Action</th></tr></thead><tbody>{ranked.map(({input,decision}) => <tr key={input.symbol} onClick={() => setSelected(input.symbol)} className={input.symbol === selected ? 'selected-row' : ''}><td><b>{input.symbol}</b><small>{input.market}{input.price != null ? ` · $${n(input.price).toFixed(n(input.price) < 1 ? 4 : 2)}` : ''}</small></td><td>{decision.alpha}</td><td>{input.gem}</td><td>{input.wave}</td><td><b>{decision.asymmetry}</b></td><td>{input.catalyst}</td><td>{input.social}</td><td>{input.liquidity}</td><td>{input.trapRisk}</td><td>{input.peakRisk}</td><td>{decision.aggression}/5</td><td><span className={`badge ${decision.hardBlocked ? 'danger' : 'good'}`}>{decision.action?.replaceAll('_',' ')}</span></td></tr>)}</tbody></table></div>}
  </section>;
}

function OpportunityDetail({ opportunity }: { opportunity: Opportunity }) {
  const { input, decision } = opportunity;
  return <section className="detail-grid">
    <div className="surface ticker-detail"><div className="section-head"><div><div className="eyebrow">Selected live opportunity</div><h2>{input.symbol} <span className="muted2">{input.market}</span></h2></div><div className="price-block"><strong>{input.price == null ? '—' : `$${n(input.price).toFixed(n(input.price) < 1 ? 4 : 2)}`}</strong><span className="good">Asym {decision.asymmetry}</span></div></div><div className="factor-grid2">{[['Gem',input.gem],['Wave',input.wave],['Catalyst',input.catalyst],['Social',input.social],['Liquidity',input.liquidity],['Confidence',input.confidence],['Trap',input.trapRisk],['Peak',input.peakRisk]].map(([name,value]) => <div key={String(name)}><span>{name}</span><b>{value}</b></div>)}</div></div>
    <div className="surface allocation-card"><h2>Decision Brain</h2><div className="allocation-action"><span>Current shadow action</span><strong>{decision.action?.replaceAll('_',' ')}</strong><p>{decision.reasons?.slice(0,3).join(' · ') || 'No rationale recorded.'}</p></div><div className="allocation-list"><div><span>Aggression</span><b>{decision.aggression}/5</b></div><div><span>Alpha</span><b>{decision.alpha}</b></div><div><span>Hard blocked</span><b>{decision.hardBlocked ? 'YES' : 'NO'}</b></div><div><span>Float</span><b>{input.floatShares == null ? '—' : `${(input.floatShares / 1e6).toFixed(1)}M`}</b></div></div></div>
  </section>;
}

function StatusPanel({ title, route, refreshToken }: { title: string; route: string; refreshToken: number }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    fetch(route, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      if (active) setData(body);
    }).catch((e) => active && setError(e instanceof Error ? e.message : 'Request failed')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [route, refreshToken]);

  const entries = data ? Object.entries(data).filter(([key, value]) => !['payload','opportunities','events','rows','items','providers','jobs','assignments'].includes(key) && (typeof value !== 'object' || value === null)).slice(0,8) : [];
  return <div className="surface mini-panel"><div className="section-head"><div><h3>{title}</h3><p>{route}</p></div>{loading && <RefreshCw size={16} className="spin"/>}</div>{error ? <div className="danger">{error}</div> : entries.length ? entries.map(([key,value]) => <div className="source-row" key={key}><span>{key}</span><b>{String(value ?? '—')}</b></div>) : <div className="muted2">{loading ? 'Loading…' : 'Connected; no scalar report fields returned.'}</div>}{data && <details style={{marginTop:10}}><summary className="tiny">View full report</summary><pre style={{whiteSpace:'pre-wrap',overflow:'auto',fontSize:11}}>{JSON.stringify(data,null,2)}</pre></details>}</div>;
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return <div className="surface" style={{padding:18, marginTop:12}}><h2>{title}</h2><p className="muted2">{detail}</p></div>;
}
