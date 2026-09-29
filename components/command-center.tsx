'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bell, BrainCircuit, Database, Gauge, Radar, RefreshCw, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { ActivationReadiness } from '@/components/activation-readiness';
import { CommandDeck } from '@/components/command-deck';
import { DiscoveryBoard, EventFeed, KillSwitchBoard, MarketOutlookBoard, ModelRegistryBoard, ResearchStatusBoard, ShadowBookBoard, SocialRadarBoard } from '@/components/workspace-boards';
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
  modelVersion?: string | null;
};

type DashboardState = {
  opportunities: Opportunity[];
  opportunityMode: string;
  evidenceScope: string;
  regime: any;
  liquidity: any;
  agents: any;
  autonomy: any;
  providers: any;
  error: string | null;
};

const emptyState: DashboardState = {
  opportunities: [], opportunityMode: 'loading', evidenceScope: 'loading', regime: null, liquidity: null,
  agents: null, autonomy: null, providers: null, error: null,
};

const nav = ['Command', 'Market Outlook', 'Discovery', 'Social Radar', 'Opportunities', 'Portfolio', 'Risk', 'Research', 'Models', 'Workflows', 'Audit'] as const;
type Workspace = typeof nav[number];

type EvidenceBannerScope = 'empty' | 'live' | 'delayed-reference' | 'mixed' | 'sample' | 'loading' | 'unknown';

function evidenceBannerScope(value: string): EvidenceBannerScope {
  switch (value) {
    case 'empty':
    case 'live':
    case 'delayed-reference':
    case 'mixed':
    case 'sample':
    case 'loading':
    case 'unknown':
      return value;
    default:
      return 'unknown';
  }
}

function evidenceBanner(mode: string, evidenceScope: string) {
  if (mode === 'sample') return 'Sample mode · database runtime not connected';
  const scope = evidenceBannerScope(evidenceScope);
  switch (scope) {
    case 'live':
      return 'LIVE EVIDENCE ONLY · warehouse-backed research state';
    case 'delayed-reference':
      return 'DELAYED REFERENCE · these rows are research context and are excluded from live proof';
    case 'mixed':
      return 'MIXED EVIDENCE · live rows and delayed-reference rows are both in this list';
    case 'empty':
      return 'Warehouse connected · no opportunity rows yet';
    case 'sample':
      return 'Sample mode · database runtime not connected';
    case 'loading':
    case 'unknown':
      return 'Research and shadow operations';
    default: {
      const unexpected: never = scope;
      return unexpected;
    }
  }
}

function opportunityTableCaption(ranked: Opportunity[]) {
  const screen = 'Penny screen keeps common stock under $5 with at least $100,000 of dollar volume.';
  const reference = ranked.filter((row) => row.modelVersion === 'mercury-delayed-reference-v1').length;
  if (ranked.length > 0 && reference === ranked.length) return `Delayed Nasdaq reference rows. They do not count as live proof. ${screen}`;
  if (reference > 0) return `Live and delayed-reference rows. Delayed rows do not count as live proof. ${screen}`;
  if (ranked.length > 0) return `Live-only ranked opportunity rows from the warehouse. ${screen}`;
  return `No penny-screen rows yet. ${screen}`;
}

function n(value: unknown, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

export function CommandCenter() {
  const [tab, setTab] = useState<Workspace>('Command');
  const [state, setState] = useState<DashboardState>(emptyState);
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<'asymmetry' | 'alpha' | 'gem' | 'wave'>('asymmetry');
  const [query, setQuery] = useState('');
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
        evidenceScope: opportunities.body?.evidenceScope ?? 'unknown',
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
  const visible = useMemo(() => {
    const needle = query.trim().toUpperCase();
    if (!needle) return ranked;
    return ranked.filter((row) => row.input.symbol.includes(needle) || (row.input.name ?? '').toUpperCase().includes(needle));
  }, [ranked, query]);

  const current = ranked.find((item) => item.input.symbol === selected) ?? ranked[0] ?? null;

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
        <div><div className="eyebrow">{tab} workspace</div><h1>{tab === 'Command' ? 'Calculated Aggression' : tab}</h1><p>{evidenceBanner(state.opportunityMode, state.evidenceScope)}</p></div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setAlerts(0)} aria-label="Clear alerts"><Bell size={17}/>{alerts > 0 && <span>{alerts}</span>}</button>
          <button className="pulse-button" onClick={runPulse} disabled={running}><RefreshCw size={16} className={running ? 'spin' : ''}/>{running ? 'Scanning' : 'Run Intelligence Pulse'}</button>
        </div>
      </header>

      {state.error && <div className="surface" style={{padding:12, marginBottom:12}}><b className="danger">Dashboard service warning:</b> {state.error}</div>}

      {tab === 'Command' && <>
        <CommandDeck ranked={ranked} evidenceScope={state.evidenceScope} regime={state.regime} liquidity={state.liquidity} autonomy={state.autonomy} loading={loading} selected={selected} onSelect={setSelected}/>
        <OpportunityTable ranked={visible} selected={selected} setSelected={setSelected} sort={sort} setSort={setSort} query={query} setQuery={setQuery}/>
        {current ? <OpportunityDetail opportunity={current}/> : <EmptyPanel title="No live opportunities" detail="The dashboard is connected, but no live non-validation opportunity rows are available yet. Delayed reference rows, when present, stay out of live proof."/>}
        {lastRefresh && <div className="tiny" style={{marginTop:10}}>Last refreshed {new Date(lastRefresh).toLocaleString()}</div>}
      </>}

      {tab === 'Market Outlook' && <MarketOutlookBoard refreshToken={refreshToken}/>}
      {tab === 'Discovery' && <><DiscoveryBoard refreshToken={refreshToken}/><OpportunityTable ranked={visible} selected={selected} setSelected={setSelected} sort={sort} setSort={setSort} query={query} setQuery={setQuery}/></>}
      {tab === 'Social Radar' && <SocialRadarBoard refreshToken={refreshToken}/>}
      {tab === 'Opportunities' && <><OpportunityTable ranked={visible} selected={selected} setSelected={setSelected} sort={sort} setSort={setSort} query={query} setQuery={setQuery}/>{current && <OpportunityDetail opportunity={current}/>}</>}
      {tab === 'Portfolio' && <><ShadowPerformance/><PromotionGate/><ShadowBookBoard refreshToken={refreshToken}/></>}
      {tab === 'Risk' && <><KillSwitchBoard refreshToken={refreshToken}/><IntelligenceLab/></>}
      {tab === 'Research' && <><ResearchStatusBoard refreshToken={refreshToken}/><IntelligenceLab/></>}
      {tab === 'Models' && <><ModelRegistryBoard refreshToken={refreshToken}/><IntelligenceLab/></>}
      {tab === 'Workflows' && <><AutonomyConsole/><AgentFleet/></>}
      {tab === 'Audit' && <><ActivationReadiness/><LiveWarehousePanel/><EventFeed refreshToken={refreshToken}/></>}
    </main>
  </div>;
}

function ScoreCell({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, n(value)));
  return <div className="cell-meter"><b>{value}</b><span className="deck-meter" aria-hidden="true"><i style={{ width: `${width}%` }} /></span></div>;
}

function OpportunityTable({ ranked, selected, setSelected, sort, setSort, query, setQuery }: {
  ranked: Opportunity[]; selected: string | null; setSelected: (value: string) => void;
  sort: 'asymmetry' | 'alpha' | 'gem' | 'wave'; setSort: (value: 'asymmetry' | 'alpha' | 'gem' | 'wave') => void;
  query: string; setQuery: (value: string) => void;
}) {
  return <section className="surface opportunity-card">
    <div className="section-head"><div><h2>Opportunity Command</h2><p>{opportunityTableCaption(ranked)}</p></div><div className="table-tools"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter ticker" aria-label="Filter opportunities"/><select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="asymmetry">Asymmetry</option><option value="alpha">Alpha</option><option value="gem">Gem</option><option value="wave">Wave</option></select></div></div>
    {ranked.length === 0 ? <div className="muted2" style={{padding:'18px 0'}}>No live opportunity rows available.</div> : <div className="table-scroll"><table className="command-table"><thead><tr><th>Ticker</th><th>Alpha</th><th>Gem</th><th>Wave</th><th>Asym.</th><th>Catalyst</th><th>Social</th><th>Liquidity</th><th>Trap</th><th>Peak</th><th>Aggr.</th><th>Action</th></tr></thead><tbody>{ranked.map(({input,decision}) => <tr key={input.symbol} onClick={() => setSelected(input.symbol)} className={input.symbol === selected ? 'selected-row' : ''}><td><b>{input.symbol}</b><small>{input.market}{input.price != null ? ` · $${n(input.price).toFixed(n(input.price) < 1 ? 4 : 2)}` : ''}</small></td><td><ScoreCell value={decision.alpha}/></td><td>{input.gem}</td><td>{input.wave}</td><td><ScoreCell value={decision.asymmetry}/></td><td>{input.catalyst}</td><td>{input.social}</td><td>{input.liquidity}</td><td>{input.trapRisk}</td><td>{input.peakRisk}</td><td>{decision.aggression}/5</td><td><span className={`badge ${decision.hardBlocked ? 'danger' : 'good'}`}>{decision.action?.replaceAll('_',' ')}</span></td></tr>)}</tbody></table></div>}
  </section>;
}

function OpportunityDetail({ opportunity }: { opportunity: Opportunity }) {
  const { input, decision } = opportunity;
  return <section className="detail-grid">
    <div className="surface ticker-detail"><div className="section-head"><div><div className="eyebrow">{opportunity.modelVersion === 'mercury-delayed-reference-v1' ? 'Selected delayed-reference opportunity' : 'Selected live opportunity'}</div><h2>{input.symbol} <span className="muted2">{input.market}</span></h2></div><div className="price-block"><strong>{input.price == null ? '—' : `$${n(input.price).toFixed(n(input.price) < 1 ? 4 : 2)}`}</strong><span className="good">Asym {decision.asymmetry}</span></div></div><div className="factor-grid2">{[['Gem',input.gem],['Wave',input.wave],['Catalyst',input.catalyst],['Social',input.social],['Liquidity',input.liquidity],['Confidence',input.confidence],['Trap',input.trapRisk],['Peak',input.peakRisk]].map(([name,value]) => <div key={String(name)}><span>{name}</span><b>{value}</b><span className="deck-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, n(value)))}%` }} /></span></div>)}</div></div>
    <div className="surface allocation-card"><h2>Decision Brain</h2><div className="allocation-action"><span>Current shadow action</span><strong>{decision.action?.replaceAll('_',' ')}</strong><p>{decision.reasons?.slice(0,3).join(' · ') || 'No rationale recorded.'}</p></div><div className="allocation-list"><div><span>Aggression</span><b>{decision.aggression}/5</b></div><div><span>Alpha</span><b>{decision.alpha}</b></div><div><span>Hard blocked</span><b>{decision.hardBlocked ? 'YES' : 'NO'}</b></div><div><span>Float</span><b>{input.floatShares == null ? '—' : `${(input.floatShares / 1e6).toFixed(1)}M`}</b></div></div></div>
  </section>;
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return <div className="surface" style={{padding:18, marginTop:12}}><h2>{title}</h2><p className="muted2">{detail}</p></div>;
}
