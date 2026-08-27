const opportunities = [
  ["IOND",94,88,96,95,8,"PRESS"],
  ["VRTX",92,91,91,93,11,"PRESS"],
  ["NOVA",89,86,88,90,15,"WAVE ACTIVE"],
  ["CRBN",87,93,74,89,9,"GEM WATCH"],
  ["AXIS",90,84,94,91,18,"WAVE ACTIVE"],
  ["DRNX",91,83,97,92,27,"WATCH"]
] as const;

const markets = [["Microcap liquidity",88],["Small-cap breadth",84],["Risk appetite",79],["Sector rotation",86],["Social speculation",73],["Funding conditions",68],["Credit stress",28],["Volatility",41]] as const;

export default function Home(){
  return <div className="shell">
    <aside className="sidebar"><div className="brand">MERCURY OS<small>Institutional Alpha Intelligence</small></div><div className="nav"><span className="active">Command</span><span>Market Outlook</span><span>Discovery</span><span>Social Radar</span><span>Opportunities</span><span>Portfolio</span><span>Risk</span><span>Research</span><span>Models</span><span>Workflows</span><span>Audit</span></div></aside>
    <main>
      <header className="top"><div><div className="eyebrow">Autonomous intelligence command</div><h1>Calculated Aggression</h1><div className="muted">High-risk, high-reward microcap discovery with independent risk gates.</div></div><div className="status">● SYSTEM ONLINE</div></header>
      <section className="metrics">{[["Market Regime","RISK-ON"],["Market Outlook","82"],["Alpha Queue","6"],["Best Asymmetry","95"],["Portfolio Heat","1.8%"],["System Health","96"]].map(([a,b])=><div className="card" key={a}><div className="label">{a}</div><div className="value">{b}</div></div>)}</section>
      <section className="grid2"><div className="panel"><h2>Maximum Market Outlook</h2><div className="sub">Cross-market conditions controlling permitted aggression.</div><div className="market-grid">{markets.map(([n,v])=><div className="mini" key={n}><span className="label">{n}</span><b>{v}</b></div>)}</div></div><div className="panel"><h2>Regime Decision</h2><div className="sub">Current capital posture</div><div className="value press">AGGRESSIVE</div><p className="muted">Liquidity, breadth and sector rotation support calculated microcap risk. Structural kill switches stay active.</p><div className="bars">{[["Liquidity",88],["Breadth",84],["Risk appetite",79],["Rotation",86]].map(([n,v])=><div className="bar-row" key={n}><span>{n}</span><div className="track"><div className="fill" style={{width:`${v}%`}} /></div><b>{v}</b></div>)}</div></div></section>
      <section className="panel opps"><h2>Opportunity Command</h2><div className="sub">Ranked after catalyst, liquidity, social, structure and manipulation-risk checks.</div><div className="table-wrap"><table><thead><tr><th>Ticker</th><th>Alpha</th><th>Gem</th><th>Wave</th><th>Asymmetry</th><th>Trap</th><th>Decision</th></tr></thead><tbody>{opportunities.map(x=><tr key={x[0]}><td className="ticker">{x[0]}</td><td>{x[1]}</td><td>{x[2]}</td><td>{x[3]}</td><td>{x[4]}</td><td>{x[5]}</td><td className={x[6]==="PRESS"?"press":"watch"}>{x[6]}</td></tr>)}</tbody></table></div></section>
      <section className="bottom"><div className="panel"><h2>Autonomous Scans</h2><div className="sub">Initial workflow schedule</div><div className="list">{[["Liquidity Pulse","1 min"],["Social Sweep","2 min"],["SEC Filings","5 min"],["Gem Universe","15 min"],["FINRA Actions","30 min"]].map(x=><div className="item" key={x[0]}><span>{x[0]}</span><b>{x[1]}</b></div>)}</div></div><div className="panel"><h2>Promotion Network Radar</h2><div className="sub">Detection and market-confirmation layer</div><div className="list">{[["Discord","READY"],["Reddit","READY"],["Telegram","READY"],["Facebook","PERMISSION GATE"]].map(x=><div className="item" key={x[0]}><span>{x[0]}</span><b>{x[1]}</b></div>)}</div></div><div className="panel"><h2>Risk Gateway</h2><div className="sub">Alpha never overrides hard controls</div><div className="list">{[["Reverse Split","ARMED"],["Dilution","ARMED"],["Promotion Risk","ARMED"],["Liquidity Collapse","ARMED"],["Peak Exhaustion","ARMED"]].map(x=><div className="item" key={x[0]}><span>{x[0]}</span><b className="press">{x[1]}</b></div>)}</div></div></section>
    </main>
  </div>
}
