'use client';

import { useEffect, useState } from 'react';

type Opportunity = {
  input: { symbol: string; market: string; price?: number | null };
  decision: { asymmetry: number; action: string; hardBlocked: boolean };
};

type RegimeReport = {
  regime?: string | null;
  outlookScore?: number;
  symbolsObserved?: number;
  medianRvol?: number | null;
  medianSpreadBps?: number | null;
  basis?: string;
  snapshotsChecked?: number;
} | null;

type LiquiditySignal = {
  symbol?: string;
  liquidityScore?: number;
  status?: string;
  dollarVolume?: number;
  evidenceClass?: string;
};

type BookPosition = { symbol: string; quantity: number; marketValue: number; unrealizedPnl: number };

type PaperBook = {
  summary?: { filled?: number; open?: number; rejected?: number };
  account?: {
    equity?: number;
    cash?: number;
    totalPnl?: number;
    totalReturnPct?: number;
    positions?: BookPosition[];
  } | null;
};

type AlpacaPaperStatus = 'unconfigured' | 'connected' | 'refused' | 'unreachable';

type AlpacaPaper = {
  status?: AlpacaPaperStatus;
  account?: { buyingPower?: number | null; cash?: number | null } | null;
  positionCount?: number;
} | null;

type Warehouse = {
  liveSecurities?: number;
  referenceOpportunities?: number;
  liveOpportunities?: number;
  referenceMarketSnapshots?: number;
  liveMarketSnapshots?: number;
  quotedSecurities?: number;
};

const ACTION_COLOR: Record<string, string> = {
  PRESS: '#35d28a',
  WAVE_ACTIVE: '#55d6d2',
  GEM_WATCH: '#9f8cff',
  WATCH: '#5aa7ff',
  REDUCE: '#f6b84a',
  EXIT: '#f36d78',
  BLOCK: '#f36d78',
};

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function compact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

function alpacaLine(snapshot: AlpacaPaper) {
  const status = snapshot?.status;
  switch (status) {
    case undefined:
      return 'Alpaca paper account …';
    case 'unconfigured':
      return 'Alpaca paper account is not connected. Keys stay on the server.';
    case 'connected': {
      const buyingPower = snapshot?.account?.buyingPower;
      const count = snapshot?.positionCount ?? 0;
      const power = buyingPower == null ? 'buying power unread' : `${money(buyingPower)} buying power`;
      return `Alpaca paper · ${power} · ${count} position${count === 1 ? '' : 's'}. Local orders stay in this book.`;
    }
    case 'refused':
      return 'Alpaca paper host required. Local orders stay in this book.';
    case 'unreachable':
      return 'Alpaca paper account unread. Local orders stay in this book.';
    default: {
      const unexpected: never = status;
      return String(unexpected);
    }
  }
}

function Meter({ value, tone = 'blue' }: { value: number; tone?: 'blue' | 'amber' | 'red' }) {
  const width = Math.max(0, Math.min(100, value));
  return <span className={`deck-meter ${tone === 'blue' ? '' : tone}`} aria-hidden="true"><i style={{ width: `${width}%` }} /></span>;
}

export function CommandDeck({
  ranked,
  evidenceScope,
  regime,
  liquidity,
  autonomy,
  loading,
  selected,
  onSelect,
}: {
  ranked: Opportunity[];
  evidenceScope: string;
  regime: RegimeReport;
  liquidity: { signals?: LiquiditySignal[]; snapshotsChecked?: number } | null;
  autonomy: { paperEngineEnabled?: boolean; capitalExecutionEnabled?: boolean } | null;
  loading: boolean;
  selected: string | null;
  onSelect: (symbol: string) => void;
}) {
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [book, setBook] = useState<PaperBook | null>(null);
  const [alpaca, setAlpaca] = useState<AlpacaPaper>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch('/api/health', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
      fetch('/api/paper/terminal', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
      fetch('/api/paper/alpaca', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
    ]).then(([health, paper, paperAccount]) => {
      if (!active) return;
      setWarehouse(health?.warehouse ?? null);
      setBook(paper ?? null);
      setAlpaca(paperAccount ?? null);
    });
    return () => { active = false; };
  }, [ranked.length, regime?.regime]);

  const counts = new Map<string, number>();
  for (const row of ranked) {
    const action = row.decision.hardBlocked ? 'BLOCK' : row.decision.action || 'WATCH';
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }
  const total = Math.max(1, ranked.length);
  const regimeName = regime?.regime ?? null;
  const outlook = Number(regime?.outlookScore ?? 0);
  const outlookTone = outlook >= 72 ? 'blue' : outlook >= 48 ? 'amber' : 'red';
  const leaders = [...ranked].sort((a, b) => b.decision.asymmetry - a.decision.asymmetry).slice(0, 6);
  const liquid = (liquidity?.signals ?? []).slice(0, 4);
  const positions = (book?.account?.positions ?? []).slice().sort((a, b) => b.marketValue - a.marketValue).slice(0, 6);
  const paperOn = autonomy?.paperEngineEnabled === true;
  const referenceLabel = evidenceScope === 'delayed-reference'
    ? 'Reference Opportunities'
    : evidenceScope === 'live'
      ? 'Live Opportunities'
      : evidenceScope === 'mixed'
        ? 'Ranked Opportunities'
        : 'Opportunities';
  const referenceNote = evidenceScope === 'delayed-reference'
    ? 'not live proof'
    : evidenceScope === 'live'
      ? 'live warehouse'
      : evidenceScope === 'mixed'
        ? 'mixed evidence'
        : 'runtime status';

  return <section className="deck" aria-label="Command deck">
    <div className="deck-kpis">
      <article className="deck-kpi">
        <span>Market Regime</span>
        <strong className={regimeName ? 'good' : 'warn'}>{loading ? '…' : regimeName ?? '—'}</strong>
        <small>{regime?.outlookScore != null ? `outlook ${regime.outlookScore}` : 'awaiting regime'}</small>
      </article>
      <article className="deck-kpi">
        <span>{referenceLabel}</span>
        <strong className={ranked.length ? 'good' : 'warn'}>{loading ? '…' : ranked.length}</strong>
        <small>{referenceNote}</small>
      </article>
      <article className="deck-kpi">
        <span>Alpha Queue</span>
        <strong>{loading ? '…' : ranked.filter((row) => !row.decision.hardBlocked).length}</strong>
        <small>unblocked names</small>
      </article>
      <article className="deck-kpi">
        <span>Best Asymmetry</span>
        <strong className="good">{loading || !ranked.length ? '…' : Math.max(...ranked.map((row) => row.decision.asymmetry))}</strong>
        <small>top rank</small>
      </article>
      <article className="deck-kpi">
        <span>Paper engine</span>
        <strong className={paperOn ? 'good' : 'warn'}>{paperOn ? 'RUNNING' : 'OFF'}</strong>
        <small>{book?.summary?.filled ?? 0} virtual fills</small>
      </article>
      <article className="deck-kpi">
        <span>Capital</span>
        <strong className="warn">LOCKED</strong>
        <small>broker disconnected</small>
      </article>
    </div>

    <div className="deck-grid">
      <article className="surface deck-card">
        <div className="section-head"><div><h2>Regime and tape</h2><p>{warehouse ? `${warehouse.quotedSecurities ?? 0} quoted · ${warehouse.referenceMarketSnapshots ?? 0} reference · ${warehouse.liveMarketSnapshots ?? 0} live` : 'Warehouse counts load with health.'}</p></div></div>
        <div className="deck-regime">
          <b className={regimeName ? 'good' : 'warn'}>{regimeName ?? 'NO REGIME'}</b>
          <span className="muted2">{regime?.symbolsObserved ?? regime?.snapshotsChecked ?? 0} symbols</span>
        </div>
        <Meter value={outlook} tone={outlookTone} />
        <div className="deck-stats">
          <div><span>Median RVOL</span><b>{regime?.medianRvol == null ? '—' : regime.medianRvol}</b></div>
          <div><span>Median spread</span><b>{regime?.medianSpreadBps == null ? '—' : `${regime.medianSpreadBps} bps`}</b></div>
          <div><span>Basis</span><b>{regime?.basis === 'volume-breadth' ? 'volume' : regime?.basis === 'microstructure' ? 'full' : '—'}</b></div>
          <div><span>Universe</span><b>{warehouse?.liveSecurities ?? '—'}</b></div>
        </div>
        <div className="deck-actions" aria-hidden="true">
          {[...counts.entries()].map(([action, count]) => <i key={action} style={{ width: `${(count / total) * 100}%`, background: ACTION_COLOR[action] ?? '#5aa7ff' }} />)}
        </div>
        <div className="deck-legend">
          {[...counts.entries()].map(([action, count]) => <span key={action}>{action.replaceAll('_', ' ')} <b>{count}</b></span>)}
          {!counts.size && <span>No actions yet</span>}
        </div>
        {liquid.length > 0 && <div className="deck-legend">{liquid.map((signal) => <span key={signal.symbol}>{signal.symbol} <b>{signal.liquidityScore}</b> {signal.status}</span>)}</div>}
        <details className="deck-report">
          <summary className="tiny">View full report</summary>
          <pre>{JSON.stringify({ regime, liquidity }, null, 2)}</pre>
        </details>
      </article>

      <article className="surface deck-card">
        <div className="section-head"><div><h2>Asymmetry ladder</h2><p>Highest asymmetry in the current book. Select a name to open its decision.</p></div></div>
        <div className="deck-ladder">
          {leaders.map((row, index) => <button key={row.input.symbol} type="button" className={row.input.symbol === selected ? 'active' : ''} onClick={() => onSelect(row.input.symbol)}>
            <em>{index + 1}</em>
            <b>{row.input.symbol}</b>
            <Meter value={row.decision.asymmetry} />
            <b>{row.decision.asymmetry}</b>
          </button>)}
          {!leaders.length && <div className="muted2">No ranked names yet.</div>}
        </div>
      </article>

      <article className="surface deck-card">
        <div className="section-head"><div><h2>Virtual book</h2><p>Paper engine fills. Capital execution stays locked.</p></div></div>
        <div className="deck-book-stats">
          <div><span>Equity</span><b>{money(book?.account?.equity)}</b></div>
          <div><span>Cash</span><b>{money(book?.account?.cash)}</b></div>
          <div><span>Total P&L</span><b className={(book?.account?.totalPnl ?? 0) >= 0 ? 'good' : 'danger'}>{money(book?.account?.totalPnl)}</b></div>
          <div><span>Return</span><b>{book?.account?.totalReturnPct == null ? '—' : `${book.account.totalReturnPct.toFixed(2)}%`}</b></div>
        </div>
        <div className="deck-positions">
          {positions.map((position) => <span key={position.symbol}><b>{position.symbol}</b>{compact(position.marketValue)}</span>)}
          {!positions.length && <span>No virtual positions</span>}
        </div>
        <div className="deck-lock"><span>Open {book?.summary?.open ?? 0} · rejected {book?.summary?.rejected ?? 0}</span><b className="warn">CAPITAL LOCKED</b></div>
        <div className="deck-lock"><span>{alpacaLine(alpaca)}</span><b className="warn">READ ONLY</b></div>
      </article>
    </div>
  </section>;
}
