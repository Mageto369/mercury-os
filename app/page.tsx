import { scoreOpportunity } from "@/lib/alpha/scoring";
import { sampleUniverse } from "@/lib/intelligence/sample-universe";
import { intelligenceJobs } from "@/lib/workflows/jobs";

const markets = [
  ["Microcap liquidity", 88],
  ["Small-cap breadth", 84],
  ["Risk appetite", 79],
  ["Sector rotation", 86],
  ["Social speculation", 73],
  ["Funding conditions", 68],
  ["Credit stress", 28],
  ["Volatility", 41],
] as const;

const socialSources = [
  ["Discord", "AUTHORIZED ONLY", "Mention velocity + group concentration"],
  ["Reddit", "READY", "Ticker trends + crowding + propagation"],
  ["Telegram", "AUTHORIZED ONLY", "Channel trend velocity + first-seen timing"],
  ["Facebook", "PERMISSION GATE", "Group attention + market confirmation"],
] as const;

export default function Home() {
  const opportunities = sampleUniverse
    .map((input) => ({ input, decision: scoreOpportunity(input) }))
    .sort((a, b) => b.decision.asymmetry - a.decision.asymmetry);

  const activeQueue = opportunities.filter(({ decision }) => ["PRESS", "WAVE_ACTIVE", "GEM_WATCH"].includes(decision.action));
  const bestAsymmetry = Math.max(...opportunities.map(({ decision }) => decision.asymmetry));
  const healthScore = 96;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">MERCURY OS<small>Institutional Alpha Intelligence</small></div>
        <div className="nav">
          <span className="active">Command</span><span>Market Outlook</span><span>Discovery</span><span>Social Radar</span><span>Opportunities</span><span>Portfolio</span><span>Risk</span><span>Research</span><span>Models</span><span>Workflows</span><span>Audit</span>
        </div>
      </aside>
      <main>
        <header className="top">
          <div>
            <div className="eyebrow">Autonomous intelligence command</div>
            <h1>Calculated Aggression</h1>
            <div className="muted">High-risk, high-reward microcap discovery with independent risk gates.</div>
          </div>
          <div className="status">● SHADOW MODE</div>
        </header>

        <section className="metrics">
          {[["Market Regime","RISK-ON"],["Market Outlook","82"],["Alpha Queue",String(activeQueue.length)],["Best Asymmetry",String(bestAsymmetry)],["Portfolio Heat","1.8%"],["System Health",String(healthScore)]].map(([a,b]) => (
            <div className="card" key={a}><div className="label">{a}</div><div className="value">{b}</div></div>
          ))}
        </section>

        <section className="grid2">
          <div className="panel">
            <h2>Maximum Market Outlook</h2>
            <div className="sub">Cross-market conditions controlling permitted aggression.</div>
            <div className="market-grid">{markets.map(([n,v]) => <div className="mini" key={n}><span className="label">{n}</span><b>{v}</b></div>)}</div>
          </div>
          <div className="panel">
            <h2>Regime Decision</h2>
            <div className="sub">Current capital posture</div>
            <div className="value press">AGGRESSIVE SELECTIVE</div>
            <p className="muted">Liquidity, breadth and sector rotation support calculated microcap risk. Structural kill switches remain dominant.</p>
            <div className="bars">{[["Liquidity",88],["Breadth",84],["Risk appetite",79],["Rotation",86]].map(([n,v]) => <div className="bar-row" key={n}><span>{n}</span><div className="track"><div className="fill" style={{width:`${v}%`}} /></div><b>{v}</b></div>)}</div>
          </div>
        </section>

        <section className="panel opps">
          <h2>Opportunity Command</h2>
          <div className="sub">Live scoring contract now runs through the calculated-aggression engine.</div>
          <div className="table-wrap"><table><thead><tr><th>Ticker</th><th>Alpha</th><th>Gem</th><th>Wave</th><th>Asymmetry</th><th>Trap</th><th>Aggression</th><th>Decision</th></tr></thead><tbody>
            {opportunities.map(({ input, decision }) => <tr key={input.symbol}><td className="ticker">{input.symbol}</td><td>{decision.alpha}</td><td>{input.gem}</td><td>{input.wave}</td><td>{decision.asymmetry}</td><td>{input.trapRisk}</td><td>{decision.aggression}/5</td><td className={decision.action === "PRESS" ? "press" : "watch"}>{decision.action.replaceAll("_", " ")}</td></tr>)}
          </tbody></table></div>
        </section>

        <section className="grid2">
          <div className="panel">
            <h2>Promotion Network Radar</h2>
            <div className="sub">Each source remains independently scored before cross-source propagation is trusted.</div>
            <div className="list">{socialSources.map(([source,status,detail]) => <div className="item" key={source}><span><b>{source}</b><small className="muted">{detail}</small></span><b>{status}</b></div>)}</div>
          </div>
          <div className="panel">
            <h2>Risk Gateway</h2>
            <div className="sub">Alpha never overrides these controls.</div>
            <div className="list">{[["Reverse Split","ARMED"],["Dilution","ARMED"],["Promotion / Manipulation","ARMED"],["Liquidity Collapse","ARMED"],["Peak Exhaustion","ARMED"],["Data Integrity","ARMED"]].map(x => <div className="item" key={x[0]}><span>{x[0]}</span><b className="press">{x[1]}</b></div>)}</div>
          </div>
        </section>

        <section className="bottom">
          <div className="panel">
            <h2>Autonomous Workflows</h2>
            <div className="sub">Research and scoring run autonomously. Capital execution remains disabled.</div>
            <div className="list">{intelligenceJobs.slice(0, 6).map(job => <div className="item" key={job.name}><span><b>{job.name.replaceAll("-", " ")}</b><small className="muted">{job.priority} priority</small></span><b>{job.cadence}</b></div>)}</div>
          </div>
          <div className="panel">
            <h2>Data Fabric</h2>
            <div className="sub">Provider readiness visible through /api/health.</div>
            <div className="list">{[["Market Data","ENV GATED"],["SEC EDGAR","ENV GATED"],["OTC Intelligence","ENV GATED"],["Social Sources","PERMISSION GATED"],["Postgres Warehouse","DATABASE_URL"]].map(x => <div className="item" key={x[0]}><span>{x[0]}</span><b>{x[1]}</b></div>)}</div>
          </div>
          <div className="panel">
            <h2>Audit & Governance</h2>
            <div className="sub">Institutional controls are part of the core architecture.</div>
            <div className="list">{[["Decision Ledger","SCHEMA READY"],["Workflow Runs","SCHEMA READY"],["Model Versioning","PLANNED"],["Human Override Log","SCHEMA READY"],["Execution","DISABLED"]].map(x => <div className="item" key={x[0]}><span>{x[0]}</span><b>{x[1]}</b></div>)}</div>
          </div>
        </section>
      </main>
    </div>
  );
}
