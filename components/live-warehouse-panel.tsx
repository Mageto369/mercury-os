'use client';

import { useEffect, useState } from 'react';
import { BarChart3, RadioTower, Waves } from 'lucide-react';

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

export function LiveWarehousePanel() {
  const [regime, setRegime] = useState<Regime | null>(null);
  const [liquidity, setLiquidity] = useState<LiquiditySignal[]>([]);
  const [social, setSocial] = useState<SocialTrend[]>([]);

  useEffect(() => {
    void Promise.all([
      fetch('/api/market/regime', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/market/liquidity', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/social/trends', { cache: 'no-store' }).then((response) => response.json()),
    ]).then(([regimeData, liquidityData, socialData]) => {
      setRegime(regimeData);
      setLiquidity(Array.isArray(liquidityData.signals) ? liquidityData.signals.slice(0, 6) : []);
      setSocial(Array.isArray(socialData.trends) ? socialData.trends.slice(0, 6) : []);
    });
  }, []);

  const persistent = Boolean(regime?.persistent);

  return <section className="live-warehouse" aria-label="Live warehouse intelligence">
    <div className="live-warehouse-head">
      <div><div className="eyebrow">Warehouse intelligence</div><h2>Live Derived Signals</h2><p>Only persisted market and authorized social observations appear here.</p></div>
      <span className={persistent ? 'badge good' : 'badge warn'}>{persistent ? 'WAREHOUSE LIVE' : 'NO LIVE DATA'}</span>
    </div>

    <div className="live-warehouse-grid">
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
