'use client';

import { useEffect, useState } from 'react';
import { Bot, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';

type Agent = {
  id: string;
  name: string;
  role: string;
  mission: string;
  ownsJobs: string[];
  authority: string[];
  dependencies: string[];
  escalationTo?: string;
  hardLimits: string[];
};

type AgentResponse = {
  mode: 'shadow';
  capitalExecutionEnabled: boolean;
  supervisor: string;
  agents: Agent[];
  guardrails: { researchExecutionAllowed: boolean; reasons: string[] };
};

export function AgentFleet() {
  const [data, setData] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/agents', { cache: 'no-store' });
      if (response.ok) setData(await response.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return <section className="agent-fleet" aria-label="Autonomous agent fleet">
    <div className="agent-head">
      <div>
        <div className="eyebrow">Autonomous organization</div>
        <h2>Mercury Agent Fleet</h2>
        <p>Specialist agents operate under one Supervisor, independent risk gates, full auditability, and zero broker authority.</p>
      </div>
      <button className="autonomy-refresh" onClick={() => void refresh()} disabled={loading}>
        <RefreshCw size={15} className={loading ? 'spin' : ''}/>{loading ? 'Checking' : 'Refresh agents'}
      </button>
    </div>

    <div className="agent-summary">
      <div><Bot size={17}/><span>Agents assembled</span><strong>{data?.agents.length ?? 0}</strong></div>
      <div><ShieldCheck size={17}/><span>Research autonomy</span><strong className={data?.guardrails.researchExecutionAllowed ? 'good' : 'danger'}>{data?.guardrails.researchExecutionAllowed ? 'ACTIVE' : 'HALTED'}</strong></div>
      <div><LockKeyhole size={17}/><span>Broker authority</span><strong className="warn">NONE</strong></div>
    </div>

    <div className="agent-grid">
      {(data?.agents ?? []).map((agent) => <article className="agent-card" key={agent.id}>
        <div className="agent-card-top"><div className="agent-avatar">{agent.name.slice(0, 1)}</div><div><h3>{agent.name}</h3><small>{agent.role}</small></div></div>
        <p>{agent.mission}</p>
        <div className="agent-meta"><span>Jobs</span><b>{agent.ownsJobs.length ? agent.ownsJobs.join(', ') : 'Supervisor / coordination'}</b></div>
        <div className="agent-meta"><span>Authority</span><b>{agent.authority.join(' · ')}</b></div>
        <div className="agent-meta"><span>Dependencies</span><b>{agent.dependencies.length ? agent.dependencies.join(', ') : 'None'}</b></div>
        <div className="agent-meta"><span>Escalation</span><b>{agent.escalationTo ?? 'Final supervisor'}</b></div>
        <div className="agent-limits"><span>Hard limits</span>{agent.hardLimits.map((limit) => <small key={limit}>{limit}</small>)}</div>
      </article>)}
    </div>
  </section>;
}
