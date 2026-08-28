'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Database, RadioTower, Waves } from 'lucide-react';

type Regime = {
  persistent: boolean;
  regime: 'RISK_ON' | 'SELECTIVE' | 'DEFENSIVE' | null;
  outlookScore?: number;
  symbolsObserved?: number;
  medianRvol?: number;
  medianSpreadBps?: number;
};

type LiquiditySignal = {
  symbol: string;
  price: number;
  dollarVolume: number;
  spreadBps: number | null;
  rvol: number | null;
  floatRotation: number | null;
  liquidityScore: number;
  status: string;
};

type SocialTrend = {
  symbol: string;
  mentions: number;
  velocity: number;
  promotionRisk: number;
  crowding: number;
  crossSourceConfirmation: number;
  sources: string[];
};

type Health = {
  status: 'ok' | 'degraded';
  requiredRuntimeReady: boolean;
  configuredProviders: number;
  totalProviders: number;
  runtime: {
    cronSecret: boolean;
    databaseConfigured: boolean;
    databaseReachable: boolean;
    schemaReady: boolean;
    marketProviderConfigured: boolean;
    secConfigured: boolean;
    openIntelligenceConfigured: boolean;
    researchProofConfigured: boolean;
    capitalExecutionEnabled: false;
    mode: 'shadow';
  };
  warehouse: {
    publicTables: number;
    liveSecurities: number;
    validationSecurities: number;
    liveOpportunities: number;
    matured60mOutcomes: number;
  };
};

export function LiveWarehousePanel() {
  const [regime, setRegime] = useState<Regime | null>(null);
  const [liquidity, setLiquidity] = useState<LiquiditySignal[]>([]);
  const [social, setSocial] = useState<SocialTrend[]>([]);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch('/api/market/regime', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/market/liquidity', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/social/trends', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/health', { cache: 'no-store' }).then((response) => response.json()),
    ]).then(([regimeData, liquidityData, socialData, healthData]) => {
      setRegime(regimeData);
      setLiquidity(Array.isArray(liquidityData.signals) ? liquidityData.signals.slice(0, 6) : []);
      setSocial(Array.isArray(socialData.trends) ? socialData.trends.slice(0, 6) : []);
      setHealth(healthData);
    });
  }, []);

  const persistent = Boolean(regime?.persistent);
  const runtimeReady = Boolean(health?.requiredRuntimeReady);

  return <section className="live-warehouse" aria-label="Live warehouse intelligence">
    <div className="live-warehouse-head">
      <div><div className="eyebrow">Warehouse intelligence</div><h2>Live Derived Signals</h2><p>Only persisted market and authorized social observations appear here.</p></div>
      <span className={runtimeReady ? 'badge good' : 'badge warn'}>{runtimeReady ? 'RUNTIME READY' : persistent ? 'WAREHOUSE LIVE' : 'RUNTIME INCOMPLETE'}</span>
    </div>

    <div className="live-warehouse-grid">
      <div className="surface live-derived-card">
        <div className="derived-title"><Database size={17}/><h3>Runtime Diagnostics</h3></div>
        {health ? <div className="derived-list">
          <div><span><b>Database</b><small>configured / reachable</small></span><strong className={health.runtime.databaseReachable ? 'good' : 'danger'}>{health.runtime.databaseReachable ? 'LIVE' : 'OFF'}</strong></div>
          <div><span><b>Schema</b><small>{health.warehouse.publicTables} public tables</small></span><strong className={health.runtime.schemaReady ? 'good' : 'warn'}>{health.runtime.schemaReady ? 'READY' : 'WAIT'}</strong></div>
          <div><span><b>Cron secret</b><small>protected automation</small></span><strong className={health.runtime.cronSecret ? 'good' : 'warn'}>{health.runtime.cronSecret ? 'SET' : 'MISSING'}</strong></div>
          <div><span><b>Providers</b><small>{health.configuredProviders}/{health.totalProviders} configured</small></span><strong>{health.configuredProviders}</strong></div>
          <div><span><b>Live evidence</b><small>{health.warehouse.liveSecurities} securities · {health.warehouse.liveOpportunities} opportunities</small></span><strong>{health.warehouse.matured60mOutcomes}</strong></div>
          <div><span><b>Capital execution</b><small>governance lock</small></span><strong className="good">LOCKED</strong></div>
        </div> : <div className="derived-empty">Loading runtime diagnostics.</div>}
      </div>

      <div className="surface live-derived-card">
        <div className="derived-title"><BarChart3 size={17}/><h3>Derived Market Regime</h3></div>
        {persistent && regime?.regime ? <>
          <strong className={regime.regime === 'RISK_ON' ? 'good' : regime.regime === 'DEFENSIVE' ? 'danger' : 'warn'}>{regime.regime.replace('_', ' ')}</strong>
          <div className="derived-stats"><span>Outlook <b>{regime.outlookScore}</b></span><span>Symbols <b>{regime.symbolsObserved}</b></span><span>Median RVOL <b>{regime.medianRvol}</b></span><span>Median spread <b>{regime.medianSpreadBps} bps</b></span></div>
        </> : <div className="derived-empty">Waiting for persisted market snapshots.</div>}
      </div>

      <div className="surface live-derived-card">
        <div className="derived-title"><Waves size={17}/><h3>Liquidity Leaders</h3></div>
        {liquidity.length ? <div className="derived-list">{liquidity.map((item) => <div key={item.symbol}><span><b>{item.symbol}</b><small>${item.price.toFixed(item.price < 1 ? 4 : 2)} · RVOL {item.rvol ?? 'n/a'}</small></span><strong>{item.liquidityScore}</strong></div>)}</div> : <div className="derived-empty">No recent liquidity observations.</div>}
      </div>

      <div className="surface live-derived-card">
        <div className="derived-title"><RadioTower size={17}/><h3>Authorized Social Leaders</h3></div>
        {social.length ? <div className="derived-list">{social.map((item) => <div key={item.symbol}><span><b>{item.symbol}</b><small>{item.sources.join(' + ') || 'source'} · {item.mentions} mentions</small></span><strong className={item.promotionRisk >= 60 ? 'danger' : item.velocity >= 75 ? 'good' : 'warn'}>{item.velocity}</strong></div>)}</div> : <div className="derived-empty">No recent authorized social observations.</div>}
      </div>
    </div>
  </section>;
}
