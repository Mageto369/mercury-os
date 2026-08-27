'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, Database, LockKeyhole, RefreshCw, ServerCog } from 'lucide-react';

type ProviderState = { configured: boolean; requiredForAutonomy: boolean };
type AutonomyStatus = {
  ok: boolean;
  mode: 'shadow';
  capitalExecutionEnabled: boolean;
  autonomousResearchEnabled: boolean;
  requiredInfrastructureReady: boolean;
  configuredProviders: number;
  totalProviders: number;
  providers: Record<string, ProviderState>;
  jobs: Array<{ name: string; cadenceMinutes: number; priority: string }>;
};

type SystemEvent = {
  id: string;
  category: string;
  severity: string;
  source: string;
  message: string;
  observedAt: string;
};

export function AutonomyConsole() {
  const [status, setStatus] = useState<AutonomyStatus | null>(null);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [eventsPersistent, setEventsPersistent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string>('');

  async function refresh() {
    setLoading(true);
    try {
      const [statusResponse, eventResponse] = await Promise.all([
        fetch('/api/autonomy/status', { cache: 'no-store' }),
        fetch('/api/events/recent?limit=8', { cache: 'no-store' }),
      ]);
      const [statusData, eventData] = await Promise.all([statusResponse.json(), eventResponse.json()]);
      if (statusResponse.ok) setStatus(statusData);
      if (eventResponse.ok) {
        setEvents(Array.isArray(eventData.events) ? eventData.events : []);
        setEventsPersistent(Boolean(eventData.persistent));
      }
      setLastChecked(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const configuredPercent = useMemo(() => {
    if (!status || status.totalProviders === 0) return 0;
    return Math.round((status.configuredProviders / status.totalProviders) * 100);
  }, [status]);

  const providers = status ? Object.entries(status.providers) : [];

  return <section className="autonomy-wrap" aria-label="Autonomy readiness">
    <div className="autonomy-head">
      <div>
        <div className="eyebrow">Backend autonomy</div>
        <h2>Autonomous Research Control</h2>
        <p>Real provider readiness, shadow execution state, and machine-generated system events.</p>
      </div>
      <button className="autonomy-refresh" onClick={() => void refresh()} disabled={loading}>
        <RefreshCw size={15} className={loading ? 'spin' : ''}/>{loading ? 'Checking' : 'Refresh readiness'}
      </button>
    </div>

    <div className="autonomy-kpis">
      <div><ServerCog size={17}/><span>Research engine</span><strong className={status?.autonomousResearchEnabled ? 'good' : 'danger'}>{status?.autonomousResearchEnabled ? 'ENABLED' : 'OFFLINE'}</strong></div>
      <div><LockKeyhole size={17}/><span>Capital execution</span><strong className="warn">{status?.capitalExecutionEnabled ? 'ENABLED' : 'LOCKED'}</strong></div>
      <div><Database size={17}/><span>Provider readiness</span><strong className={configuredPercent >= 80 ? 'good' : configuredPercent >= 40 ? 'warn' : 'danger'}>{configuredPercent}%</strong></div>
      <div><Activity size={17}/><span>Scheduled jobs</span><strong>{status?.jobs.length ?? 0}</strong></div>
    </div>

    <div className="autonomy-grid">
      <div className="autonomy-panel">
        <div className="autonomy-panel-title"><h3>Provider Matrix</h3><small>{status?.configuredProviders ?? 0}/{status?.totalProviders ?? 0} configured</small></div>
        <div className="provider-grid">
          {providers.map(([name, provider]) => <div className="provider-item" key={name}>
            <span><i className={provider.configured ? 'provider-dot ready' : 'provider-dot missing'}/>{name}</span>
            <b className={provider.configured ? 'good' : 'danger'}>{provider.configured ? 'READY' : 'MISSING'}</b>
            {provider.requiredForAutonomy && <small>core</small>}
          </div>)}
          {!providers.length && <div className="provider-empty">Provider status is loading.</div>}
        </div>
      </div>

      <div className="autonomy-panel">
        <div className="autonomy-panel-title"><h3>Autonomy Safety State</h3><small>{lastChecked ? `checked ${lastChecked}` : 'checking'}</small></div>
        <div className="autonomy-rules">
          <div><span>Mode</span><b className="warn">SHADOW</b></div>
          <div><span>Required infrastructure</span><b className={status?.requiredInfrastructureReady ? 'good' : 'danger'}>{status?.requiredInfrastructureReady ? 'READY' : 'INCOMPLETE'}</b></div>
          <div><span>Missing-feed behavior</span><b className="good">SKIP / DEGRADE</b></div>
          <div><span>Fabricated live data</span><b className="good">PROHIBITED</b></div>
          <div><span>Broker order routing</span><b className="warn">DISABLED</b></div>
        </div>
      </div>

      <div className="autonomy-panel event-stream">
        <div className="autonomy-panel-title"><h3>Machine Event Stream</h3><small>{eventsPersistent ? 'persistent warehouse' : 'warehouse offline'}</small></div>
        {events.length ? <div className="event-list">{events.map((event) => <div className="event-row" key={event.id}>
          <span><b>{event.category}</b><small>{event.source} · {new Date(event.observedAt).toLocaleString()}</small></span>
          <p>{event.message}</p>
          <em className={event.severity === 'critical' ? 'danger' : event.severity === 'high' ? 'warn' : 'good'}>{event.severity}</em>
        </div>)}</div> : <div className="event-empty">{eventsPersistent ? 'No machine events recorded yet.' : 'Connect Postgres to persist autonomous filing, risk, and workflow events.'}</div>}
      </div>
    </div>
  </section>;
}
