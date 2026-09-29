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
    catalyst: number | null;
    social: number | null;
    liquidity: number;
    trapRisk: number;
    peakRisk: number;
    confidence: number;
    floatShares?: number | null;
    avgDollarVolume20d?: number | null;
  };
  history?: {
    closes: number[];
    sessions: Array<{ date: string; close: number; volume: number | null }>;
    previousClose: number | null;
    changePct: number | null;
    high: number | null;
    low: number | null;
    return5Pct: number | null;
    relativeVolume: number | null;
    rangePositionPct: number | null;
    extension20Pct: number | null;
    closeLocationPct: number | null;
    rise?: { score: number | null; room: boolean };
  };
  push?: {
    newsLabel: string | null;
    newsForm: string | null;
    blocksRoom: boolean;
    socialHype: number | null;
    adjustment: number | null;
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
  const screen = 'Penny screen keeps common stock under $5 with at least $100,000 of dollar volume. New simulated buys also require a ROOM rank. News is an SEC filing from the last 14 days. Hype is a Stocktwits snapshot and stays blank until one is stored.';
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
  const [sort, setSort] = useState<OpportunitySort>('asymmetry');
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

  const ranked = useMemo(() => [...state.opportunities].sort((a, b) => compareOpportunities(a, b, sort)), [state.opportunities, sort]);
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

function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function formatChange(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatDollarVolume(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function formatMultiple(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}×`;
}

function formatFactor(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
}

function formatRange(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value)}%`;
}

function changeClass(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '';
  return value < 0 ? 'danger' : 'good';
}

type OpportunitySort = 'asymmetry' | 'alpha' | 'gem' | 'wave' | 'return5' | 'relativeVolume' | 'range' | 'dollarVolume' | 'extension20' | 'closeLocation' | 'rise' | 'hype';

function finiteSortValue(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function compareOpportunities(left: Opportunity, right: Opportunity, sort: OpportunitySort) {
  switch (sort) {
    case 'alpha':
      return right.decision.alpha - left.decision.alpha;
    case 'gem':
      return right.input.gem - left.input.gem;
    case 'wave':
      return right.input.wave - left.input.wave;
    case 'return5':
      return finiteSortValue(right.history?.return5Pct) - finiteSortValue(left.history?.return5Pct);
    case 'relativeVolume':
      return finiteSortValue(right.history?.relativeVolume) - finiteSortValue(left.history?.relativeVolume);
    case 'range':
      return finiteSortValue(right.history?.rangePositionPct) - finiteSortValue(left.history?.rangePositionPct);
    case 'dollarVolume':
      return finiteSortValue(right.input.avgDollarVolume20d) - finiteSortValue(left.input.avgDollarVolume20d);
    case 'extension20':
      return finiteSortValue(right.history?.extension20Pct) - finiteSortValue(left.history?.extension20Pct);
    case 'closeLocation':
      return finiteSortValue(right.history?.closeLocationPct) - finiteSortValue(left.history?.closeLocationPct);
    case 'rise':
      return Number(Boolean(right.history?.rise?.room)) - Number(Boolean(left.history?.rise?.room))
        || finiteSortValue(right.history?.rise?.score) - finiteSortValue(left.history?.rise?.score);
    case 'hype':
      return finiteSortValue(right.push?.socialHype) - finiteSortValue(left.push?.socialHype);
    case 'asymmetry':
      return right.decision.asymmetry - left.decision.asymmetry;
    default: {
      const unexpected: never = sort;
      return unexpected;
    }
  }
}

function RiseRoomStrip({ ranked, setSelected }: { ranked: Opportunity[]; setSelected: (symbol: string) => void }) {
  const room = ranked
    .filter((row) => row.history?.rise?.room)
    .sort((left, right) => (right.history?.rise?.score ?? 0) - (left.history?.rise?.score ?? 0));
  return <div className="rise-room"><span>Rise with room</span>{room.length === 0 ? <span>No penny is rising on above-average volume while still close to its 20-session average.</span> : room.map((row) => <button key={row.input.symbol} type="button" onClick={() => setSelected(row.input.symbol)}>{row.input.symbol}<b className="good">{row.history?.rise?.score}</b></button>)}</div>;
}

function PriceSpark({ closes }: { closes: number[] }) {
  if (closes.length < 2) return <span className="muted2">—</span>;
  const width = 84;
  const height = 24;
  const low = Math.min(...closes);
  const high = Math.max(...closes);
  const span = high - low || 1;
  const path = closes.map((close, index) => {
    const x = (index / (closes.length - 1)) * width;
    const y = height - ((close - low) / span) * (height - 2) - 1;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const up = closes[closes.length - 1] >= closes[0];
  return <svg className={`price-spark ${up ? 'good' : 'danger'}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

function ScoreCell({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, n(value)));
  return <div className="cell-meter"><b>{value}</b><span className="deck-meter" aria-hidden="true"><i style={{ width: `${width}%` }} /></span></div>;
}

function OpportunityTable({ ranked, selected, setSelected, sort, setSort, query, setQuery }: {
  ranked: Opportunity[]; selected: string | null; setSelected: (value: string) => void;
  sort: OpportunitySort; setSort: (value: OpportunitySort) => void;
  query: string; setQuery: (value: string) => void;
}) {
  return <section className="surface opportunity-card">
    <div className="section-head"><div><h2>Opportunity Command</h2><p>{opportunityTableCaption(ranked)}</p></div><div className="table-tools"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter ticker" aria-label="Filter opportunities"/><select value={sort} onChange={(e) => setSort(e.target.value as OpportunitySort)}><option value="asymmetry">Asymmetry</option><option value="alpha">Alpha</option><option value="gem">Gem</option><option value="wave">Wave</option><option value="return5">5-session</option><option value="relativeVolume">Relative volume</option><option value="range">Range position</option><option value="dollarVolume">Dollar volume</option><option value="extension20">Distance from 20-session average</option><option value="closeLocation">Close in day range</option><option value="rise">Rise with room</option><option value="hype">Social hype</option></select></div></div>
    <RiseRoomStrip ranked={ranked} setSelected={setSelected}/>
    {ranked.length === 0 ? <div className="muted2" style={{padding:'18px 0'}}>No live opportunity rows available.</div> : <div className="table-scroll"><table className="command-table"><thead><tr><th>Ticker</th><th>Price</th><th>30d</th><th>5d</th><th>RVol</th><th>Range</th><th>$ Vol</th><th>vs 20d</th><th>Hold</th><th>Rise</th><th>News</th><th>Hype</th><th>Alpha</th><th>Gem</th><th>Wave</th><th>Asym.</th><th>Catalyst</th><th>Social</th><th>Liquidity</th><th>Trap</th><th>Peak</th><th>Aggr.</th><th>Action</th></tr></thead><tbody>{ranked.map((row) => {
      const { input, decision, history } = row;
      return <tr key={input.symbol} onClick={() => setSelected(input.symbol)} className={input.symbol === selected ? 'selected-row' : ''}><td><b>{input.symbol}</b><small>{input.market}</small></td><td><b>{formatPrice(input.price)}</b><small className={changeClass(history?.changePct)}>{formatChange(history?.changePct)}</small></td><td><PriceSpark closes={history?.closes ?? []} /></td><td className={changeClass(history?.return5Pct)}>{formatChange(history?.return5Pct)}</td><td>{formatMultiple(history?.relativeVolume)}</td><td>{formatRange(history?.rangePositionPct)}</td><td>{formatDollarVolume(input.avgDollarVolume20d)}</td><td className={changeClass(history?.extension20Pct)}>{formatChange(history?.extension20Pct)}</td><td>{formatRange(history?.closeLocationPct)}</td><td>{history?.rise?.score == null ? '—' : history.rise.score}{history?.rise?.room ? <small className="good"> ROOM</small> : null}</td><td>{row.push?.newsForm ?? '—'}</td><td>{row.push?.socialHype == null ? '—' : row.push.socialHype}</td><td><ScoreCell value={decision.alpha}/></td><td>{input.gem}</td><td>{input.wave}</td><td><ScoreCell value={decision.asymmetry}/></td><td>{formatFactor(input.catalyst)}</td><td>{formatFactor(input.social)}</td><td>{input.liquidity}</td><td>{input.trapRisk}</td><td>{input.peakRisk}</td><td>{decision.aggression}/5</td><td><span className={`badge ${decision.hardBlocked ? 'danger' : 'good'}`}>{decision.action?.replaceAll('_',' ')}</span></td></tr>;
    })}</tbody></table></div>}
  </section>;
}

function OpportunityDetail({ opportunity }: { opportunity: Opportunity }) {
  const { input, decision, history } = opportunity;
  const sessions = history?.sessions ?? [];
  return <section className="detail-grid">
    <div className="surface ticker-detail"><div className="section-head"><div><div className="eyebrow">{opportunity.modelVersion === 'mercury-delayed-reference-v1' ? 'Selected delayed-reference opportunity' : 'Selected live opportunity'}</div><h2>{input.symbol} <span className="muted2">{input.market}</span></h2></div><div className="price-block"><strong>{formatPrice(input.price)}</strong><span className={history?.changePct != null && history.changePct < 0 ? 'danger' : 'good'}>{formatChange(history?.changePct)}</span></div></div><div className="history-strip"><PriceSpark closes={history?.closes ?? []} /><div><span>Prior close</span><b>{formatPrice(history?.previousClose)}</b></div><div><span>5-session</span><b className={changeClass(history?.return5Pct)}>{formatChange(history?.return5Pct)}</b></div><div><span>Rel. volume</span><b>{formatMultiple(history?.relativeVolume)}</b></div><div><span>Range</span><b>{formatRange(history?.rangePositionPct)}</b></div><div><span>Dollar vol</span><b>{formatDollarVolume(input.avgDollarVolume20d)}</b></div><div><span>vs 20d avg</span><b className={changeClass(history?.extension20Pct)}>{formatChange(history?.extension20Pct)}</b></div><div><span>Close in range</span><b>{formatRange(history?.closeLocationPct)}</b></div><div><span>Rise</span><b>{history?.rise?.score == null ? '—' : history.rise.score}</b></div><div><span>Room</span><b className={history?.rise?.room ? 'good' : ''}>{history?.rise?.room ? 'YES' : 'NO'}</b></div><div><span>News</span><b>{opportunity.push?.newsLabel ?? '—'}</b></div><div><span>Hype</span><b>{opportunity.push?.socialHype == null ? '—' : opportunity.push.socialHype}</b></div><div><span>30d high</span><b>{formatPrice(history?.high)}</b></div><div><span>30d low</span><b>{formatPrice(history?.low)}</b></div></div><div className="factor-grid2">{[['Gem',input.gem],['Wave',input.wave],['Catalyst',input.catalyst],['Social',input.social],['Liquidity',input.liquidity],['Confidence',input.confidence],['Trap',input.trapRisk],['Peak',input.peakRisk]].map(([name,value]) => <div key={String(name)}><span>{name}</span><b>{formatFactor(typeof value === 'number' ? value : null)}</b><span className="deck-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, n(value)))}%` }} /></span></div>)}</div>{sessions.length ? <table className="command-table history-table"><thead><tr><th>Session</th><th>Close</th><th>Volume</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.date}><td>{session.date}</td><td>{formatPrice(session.close)}</td><td>{session.volume == null ? '—' : session.volume.toLocaleString()}</td></tr>)}</tbody></table> : <p className="muted2">No delayed daily history stored for this name yet.</p>}</div>
    <div className="surface allocation-card"><h2>Decision Brain</h2><div className="allocation-action"><span>Current shadow action</span><strong>{decision.action?.replaceAll('_',' ')}</strong><p>{decision.reasons?.slice(0,3).join(' · ') || 'No rationale recorded.'}</p></div><div className="allocation-list"><div><span>Aggression</span><b>{decision.aggression}/5</b></div><div><span>Alpha</span><b>{decision.alpha}</b></div><div><span>Hard blocked</span><b>{decision.hardBlocked ? 'YES' : 'NO'}</b></div><div><span>Float</span><b>{input.floatShares == null ? '—' : `${(input.floatShares / 1e6).toFixed(1)}M`}</b></div></div></div>
  </section>;
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return <div className="surface" style={{padding:18, marginTop:12}}><h2>{title}</h2><p className="muted2">{detail}</p></div>;
}
