'use client';

import { useMemo, useState } from 'react';
import { Activity, Bell, BrainCircuit, Database, Gauge, Radar, RefreshCw, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { scoreOpportunity } from '@/lib/alpha/scoring';
import { sampleUniverse } from '@/lib/intelligence/sample-universe';

const marketSignals = [
  ['Microcap liquidity', 88], ['Small-cap breadth', 84], ['Risk appetite', 79], ['Sector rotation', 86],
  ['Social speculation', 73], ['Funding conditions', 68], ['Credit stress', 28], ['Volatility', 41],
] as const;

const sourceRows = [
  ['Discord', 'IOND', 91, 74, 'EARLY'], ['Reddit', 'DRNX', 86, 81, 'RISING'],
  ['Telegram', 'CRBN', 94, 69, 'EARLY'], ['Facebook', 'IOND', 71, 63, 'WATCH'],
] as const;

const jobs = [
  ['Liquidity Pulse', '1m', 'critical'], ['Risk Gateway', '1m', 'critical'], ['Social Radar', '2m', 'high'],
  ['SEC Filings', '5m', 'critical'], ['Market Regime', '5m', 'high'], ['Gem Discovery', '15m', 'high'],
  ['Share Structure', '15m', 'critical'], ['FINRA Actions', '30m', 'critical'], ['Model Learning', 'daily', 'normal'],
] as const;

function scoreColor(value: number, inverse = false) {
  const good = inverse ? value <= 30 : value >= 80;
  const danger = inverse ? value >= 65 : value < 55;
  return good ? 'good' : danger ? 'danger' : 'warn';
}

export function CommandCenter() {
  const [selected, setSelected] = useState(sampleUniverse[0].symbol);
  const [tab, setTab] = useState('Command');
  const [sort, setSort] = useState<'asymmetry' | 'alpha' | 'gem' | 'wave'>('asymmetry');
  const [pulse, setPulse] = useState(0);
  const [running, setRunning] = useState(false);
  const [alerts, setAlerts] = useState(3);

  const opportunities = useMemo(() => sampleUniverse.map((input, index) => {
    const drift = pulse ? ((index + pulse) % 3) - 1 : 0;
    const liveInput = { ...input, wave: Math.max(0, Math.min(100, input.wave + drift)), social: Math.max(0, Math.min(100, input.social + drift)) };
    return { input: liveInput, decision: scoreOpportunity(liveInput) };
  }), [pulse]);

  const ranked = [...opportunities].sort((a, b) => {
    if (sort === 'alpha') return b.decision.alpha - a.decision.alpha;
    if (sort === 'gem') return b.input.gem - a.input.gem;
    if (sort === 'wave') return b.input.wave - a.input.wave;
    return b.decision.asymmetry - a.decision.asymmetry;
  });
  const current = opportunities.find(x => x.input.symbol === selected) ?? opportunities[0];

  async function runPulse() {
    setRunning(true);
    try {
      await fetch('/api/control/pulse', { method: 'POST' });
      setPulse(v => v + 1);
      setAlerts(v => Math.min(9, v + 1));
    } finally {
      setTimeout(() => setRunning(false), 350);
    }
  }

  const nav = ['Command', 'Market Outlook', 'Discovery', 'Social Radar', 'Opportunities', 'Portfolio', 'Risk', 'Research', 'Models', 'Workflows', 'Audit'];
  const iconMap: Record<string, React.ReactNode> = { Command: <Gauge size={16}/>, 'Market Outlook': <TrendingUp size={16}/>, Discovery: <Sparkles size={16}/>, 'Social Radar': <Radar size={16}/>, Risk: <ShieldCheck size={16}/>, Models: <BrainCircuit size={16}/>, Workflows: <Activity size={16}/>, Audit: <Database size={16}/> };

  return <div className="app-shell">
    <aside className="sidebar2">
      <div className="brand2"><div className="logo-mark">M</div><div><b>MERCURY OS</b><small>Institutional Alpha Intelligence</small></div></div>
      <nav>{nav.map(item => <button key={item} onClick={() => setTab(item)} className={tab === item ? 'nav-btn active' : 'nav-btn'}>{iconMap[item] ?? <span className="nav-dot"/>}<span>{item}</span></button>)}</nav>
      <div className="sidebar-foot"><span className="live-dot"/> SHADOW MODE<div className="tiny">Execution disabled</div></div>
    </aside>

    <main className="workspace">
      <header className="command-header"><div><div className="eyebrow">{tab} workspace</div><h1>Calculated Aggression</h1><p>High-risk, high-reward microcap intelligence with independent institutional risk gates.</p></div><div className="header-actions"><button className="icon-button" onClick={() => setAlerts(0)} aria-label="Clear alerts"><Bell size={17}/><span>{alerts}</span></button><button className="pulse-button" onClick={runPulse} disabled={running}><RefreshCw size={16} className={running ? 'spin' : ''}/>{running ? 'Scanning' : 'Run Intelligence Pulse'}</button></div></header>

      <section className="kpi-strip">
        {[
          ['Market Regime','RISK-ON','good'], ['Market Outlook','82','good'], ['Alpha Queue', String(ranked.filter(x => !x.decision.hardBlocked).length),'good'],
          ['Best Asymmetry',String(Math.max(...ranked.map(x=>x.decision.asymmetry))),'good'], ['Portfolio Heat','1.8%','warn'], ['System Health','96','good']
        ].map(([label,value,tone]) => <div className="kpi" key={label}><span>{label}</span><strong className={tone}>{value}</strong><small>{label === 'Portfolio Heat' ? 'within desk budget' : 'live composite'}</small></div>)}
      </section>

      <section className="hero-grid">
        <div className="surface outlook-card"><div className="section-head"><div><h2>Maximum Market Outlook</h2><p>Cross-market conditions controlling permitted aggression.</p></div><span className="badge good">AGGRESSIVE SELECTIVE</span></div><div className="signal-grid">{marketSignals.map(([name,value]) => <div className="signal" key={name}><div><span>{name}</span><strong>{value}</strong></div><div className="meter"><i style={{width:`${value}%`}}/></div></div>)}</div><div className="regime-chart">{[52,58,61,60,67,72,70,75,78,82,80,85,88,86,91,89,92,94].map((v,i)=><i key={i} style={{height:`${v}%`}}/>)}</div></div>
        <div className="surface decision-card"><div className="section-head"><div><h2>Regime Decision</h2><p>Current capital posture</p></div><ShieldCheck size={22}/></div><div className="decision-word">PRESS ADVANTAGE</div><p className="decision-copy">Liquidity, breadth and rotation support calculated microcap exposure. Structural kill switches remain dominant.</p><div className="rule-stack">{[['Liquidity gate','CLEAR'],['Correlation guard','CLEAR'],['Promotion filter','ARMED'],['Execution','SHADOW']].map(([a,b])=><div key={a}><span>{a}</span><b className={b==='CLEAR'?'good':'warn'}>{b}</b></div>)}</div></div>
      </section>

      <section className="surface opportunity-card"><div className="section-head"><div><h2>Opportunity Command</h2><p>Ranked after catalyst, liquidity, social, share-structure and manipulation-risk checks.</p></div><select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="asymmetry">Asymmetry</option><option value="alpha">Alpha</option><option value="gem">Gem</option><option value="wave">Wave</option></select></div><div className="table-scroll"><table className="command-table"><thead><tr><th>Ticker</th><th>Alpha</th><th>Gem</th><th>Wave</th><th>Asym.</th><th>Catalyst</th><th>Social</th><th>Liquidity</th><th>Trap</th><th>Peak</th><th>Aggr.</th><th>Action</th></tr></thead><tbody>{ranked.map(({input,decision})=><tr key={input.symbol} onClick={()=>setSelected(input.symbol)} className={input.symbol===selected?'selected-row':''}><td><b>{input.symbol}</b><small>{input.market} · ${input.price.toFixed(input.price<1?4:2)}</small></td><td>{decision.alpha}</td><td>{input.gem}</td><td>{input.wave}</td><td><b>{decision.asymmetry}</b></td><td>{input.catalyst}</td><td>{input.social}</td><td>{input.liquidity}</td><td className={scoreColor(input.trapRisk,true)}>{input.trapRisk}</td><td className={scoreColor(input.peakRisk,true)}>{input.peakRisk}</td><td>{decision.aggression}/5</td><td><span className={`badge ${decision.action==='BLOCK'?'danger':decision.action==='REDUCE'||decision.action==='EXIT'?'warn':'good'}`}>{decision.action.replaceAll('_',' ')}</span></td></tr>)}</tbody></table></div></section>

      <section className="detail-grid">
        <div className="surface ticker-detail"><div className="section-head"><div><div className="eyebrow">Selected opportunity</div><h2>{current.input.symbol} <span className="muted2">{current.input.market}</span></h2></div><div className="price-block"><strong>${current.input.price.toFixed(current.input.price<1?4:2)}</strong><span className="good">ASym {current.decision.asymmetry}</span></div></div><div className="price-chart2"><svg viewBox="0 0 680 180" role="img" aria-label="Simulated market path"><polyline points="0,150 40,148 80,144 120,146 160,136 200,131 240,126 280,114 320,117 360,96 400,86 440,72 480,77 520,55 560,47 600,38 640,30 680,35" fill="none" stroke="currentColor" strokeWidth="4"/><line x1="0" y1="120" x2="680" y2="120"/><line x1="0" y1="60" x2="680" y2="60"/></svg></div><div className="factor-grid2">{[['Gem',current.input.gem],['Wave',current.input.wave],['Catalyst',current.input.catalyst],['Social',current.input.social],['Liquidity',current.input.liquidity],['Confidence',current.input.confidence],['Dilution',current.input.dilutionRisk],['Peak',current.input.peakRisk]].map(([n,v])=><div key={n}><span>{n}</span><b className={['Dilution','Peak'].includes(String(n))?scoreColor(Number(v),true):scoreColor(Number(v))}>{v}</b></div>)}</div></div>
        <div className="surface allocation-card"><h2>Capital Decision Brain</h2><div className="allocation-action"><span>Current action</span><strong>{current.decision.action.replaceAll('_',' ')}</strong><p>{current.decision.reasons.slice(0,3).join(' · ') || 'Await additional confirmation.'}</p></div><div className="allocation-list">{[['Aggression',`${current.decision.aggression}/5`],['Risk multiplier',`${current.decision.suggestedRiskMultiplier.toFixed(2)}x`],['Market cap',`$${(current.input.marketCapUsd/1e6).toFixed(1)}M`],['20D $ volume',`$${(current.input.avgDollarVolume20d/1000).toFixed(0)}K`],['Float',`${(current.input.floatShares/1e6).toFixed(1)}M`]].map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}</div></div>
      </section>

      <section className="quad-grid">
        <div className="surface mini-panel"><h3>Gem Discovery</h3>{[['Hidden accumulation',86],['Structure quality',91],['Attention gap',82],['Catalyst timing',88]].map(([a,b])=><Metric key={String(a)} label={String(a)} value={Number(b)}/>)}</div>
        <div className="surface mini-panel"><h3>Promotion Network Radar</h3>{sourceRows.map(([src,ticker,vel,confirm])=><div className="source-row" key={src}><span>{src}<small>{ticker}</small></span><b>{vel}</b><em>{confirm}% confirm</em></div>)}</div>
        <div className="surface mini-panel"><h3>Liquidity / Microstructure</h3>{[['Spread',94],['RVOL acceleration',91],['Absorption',83],['Float rotation',76]].map(([a,b])=><Metric key={String(a)} label={String(a)} value={Number(b)}/>)}</div>
        <div className="surface mini-panel"><h3>Risk / Trap</h3>{[['Reverse split',8],['Dilution',14],['Promotion',21],['Peak pressure',current.input.peakRisk]].map(([a,b])=><Metric key={String(a)} label={String(a)} value={Number(b)} inverse/>)}</div>
      </section>

      <section className="triple-grid">
        <div className="surface jobs-panel"><div className="section-head"><div><h2>Cron Intelligence</h2><p>Autonomous research schedule</p></div><Activity size={20}/></div>{jobs.map(([name,cadence,priority])=><div className="job" key={name}><span><i className={priority==='critical'?'critical-dot':'high-dot'}/>{name}</span><b>{cadence}</b></div>)}</div>
        <div className="surface jobs-panel"><div className="section-head"><div><h2>Model Consensus</h2><p>Independent signal agreement</p></div><BrainCircuit size={20}/></div>{[['Fundamental','BULLISH',88],['Microstructure','BULLISH',94],['Social','BULLISH',83],['Risk','CLEAR',91],['Regime','RISK-ON',82]].map(([a,b,c])=><div className="consensus-row" key={String(a)}><span>{a}</span><b>{b}</b><em>{c}%</em></div>)}</div>
        <div className="surface jobs-panel"><div className="section-head"><div><h2>System Health</h2><p>Data and model readiness</p></div><Database size={20}/></div>{[['Market feed',100],['SEC feed',100],['OTC structure',94],['Social feeds',88],['Model health',96]].map(([a,b])=><Metric key={String(a)} label={String(a)} value={Number(b)}/>)}</div>
      </section>
    </main>
  </div>;
}

function Metric({label,value,inverse=false}:{label:string;value:number;inverse?:boolean}) {
  return <div className="metric-row"><span>{label}</span><div className="metric-meter"><i style={{width:`${value}%`}}/></div><b className={scoreColor(value,inverse)}>{value}</b></div>;
}
