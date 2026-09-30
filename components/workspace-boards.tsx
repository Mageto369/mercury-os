'use client';

import { useEffect, useState } from 'react';

type Report = Record<string, unknown> | null;

function useReport(route: string, refreshToken: number) {
  const [data, setData] = useState<Report>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(route, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`);
        if (active) setData(body);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Request failed');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [route, refreshToken]);

  return { data, error, loading };
}

function money(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function ReportDisclosure({ data }: { data: Report }) {
  if (!data) return null;
  return <details className="deck-report"><summary className="tiny">View full report</summary><pre>{JSON.stringify(data, null, 2)}</pre></details>;
}

function BoardState({ loading, error, empty }: { loading: boolean; error: string | null; empty: string }) {
  if (error) return <div className="danger">{error}</div>;
  if (loading) return <div className="muted2">Loading…</div>;
  return <div className="muted2">{empty}</div>;
}

export function MarketOutlookBoard({ refreshToken }: { refreshToken: number }) {
  const regime = useReport('/api/market/regime', refreshToken);
  const liquidity = useReport('/api/market/liquidity', refreshToken);
  const providers = useReport('/api/providers/market/status', refreshToken);
  const signals = Array.isArray(liquidity.data?.signals) ? liquidity.data.signals.slice(0, 12) : [];
  const providerRows = Array.isArray(providers.data?.providers) ? providers.data.providers : [];
  const outlook = num(regime.data?.outlookScore);
  const thinTape = regime.data?.basis === 'volume-breadth';

  return <section className="board-stack" aria-label="Market outlook board">
    <div className="board-split">
      <article className="surface deck-card">
        <div className="section-head"><div><h2>Regime</h2><p>{regime.loading ? 'Reading the latest regime.' : thinTape ? 'Delayed daily bars have no RVOL or spread, so outlook is dollar-volume breadth.' : 'Regime is derived from stored market snapshots.'}</p></div></div>
        <div className="deck-regime"><b className={regime.data?.regime ? 'good' : 'warn'}>{regime.loading ? '…' : text(regime.data?.regime, 'NO REGIME')}</b><span className="muted2">outlook {outlook ?? '—'}</span></div>
        <span className="deck-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, outlook ?? 0))}%` }} /></span>
        <div className="deck-stats">
          <div><span>Symbols</span><b>{text(regime.data?.symbolsObserved ?? regime.data?.snapshotsChecked)}</b></div>
          <div><span>Median RVOL</span><b>{regime.data?.medianRvol == null ? '—' : text(regime.data.medianRvol)}</b></div>
          <div><span>Median spread</span><b>{regime.data?.medianSpreadBps == null ? '—' : `${regime.data.medianSpreadBps} bps`}</b></div>
          <div><span>Breadth</span><b>{text(regime.data?.breadthProxy)}</b></div>
          <div><span>Float rotation</span><b>{text(regime.data?.avgFloatRotation)}</b></div>
          <div><span>Snapshots</span><b>{text(regime.data?.snapshotsChecked)}</b></div>
        </div>
        <ReportDisclosure data={regime.data} />
      </article>
      <article className="surface deck-card">
        <div className="section-head"><div><h2>Market providers</h2><p>Only a configured live adapter can create live proof. Delayed Nasdaq stays reference context.</p></div></div>
        {providerRows.length ? providerRows.map((provider) => {
          const row = provider as { name?: string; configured?: boolean; evidenceClass?: string };
          return <div className="provider-row" key={row.name}><span><b>{row.name}</b><small className="muted2"> {row.evidenceClass === 'delayed-reference' ? 'delayed reference' : row.evidenceClass}</small></span><b className={row.configured ? 'good' : 'warn'}>{row.configured ? 'ON' : 'OFF'}</b></div>;
        }) : <BoardState loading={providers.loading} error={providers.error} empty="No provider status returned." />}
      </article>
    </div>
    <article className="surface opportunity-card">
      <div className="section-head"><div><h2>Liquidity tape</h2><p>{liquidity.loading ? 'Reading the liquidity pulse.' : signals.length ? `${signals.length} names from the latest liquidity pulse.` : 'No liquidity signals yet.'}</p></div></div>
      {signals.length ? <div className="table-scroll"><table className="command-table"><thead><tr><th>Ticker</th><th>Dollar volume</th><th>Score</th><th>Status</th><th>Evidence</th></tr></thead><tbody>{signals.map((signal) => {
        const row = signal as { symbol?: string; dollarVolume?: number; liquidityScore?: number; status?: string; evidenceClass?: string };
        return <tr key={row.symbol}><td><b>{row.symbol}</b></td><td>{money(Number(row.dollarVolume ?? 0))}</td><td>{row.liquidityScore}</td><td>{row.status}</td><td>{row.evidenceClass === 'delayed-reference' ? 'delayed reference' : text(row.evidenceClass)}</td></tr>;
      })}</tbody></table></div> : <BoardState loading={liquidity.loading} error={liquidity.error} empty="The liquidity pulse has not stored signals." />}
    </article>
  </section>;
}

export function DiscoveryBoard({ refreshToken }: { refreshToken: number }) {
  const gems = useReport('/api/gems', refreshToken);
  const candidates = Array.isArray(gems.data?.candidates) ? gems.data.candidates.slice(0, 15) : [];
  const total = Array.isArray(gems.data?.candidates) ? gems.data.candidates.length : 0;
  return <article className="surface opportunity-card">
    <div className="section-head"><div><h2>Gem candidates</h2><p>{gems.loading ? 'Ranking the penny screen.' : total ? `Showing ${candidates.length} of ${total} penny names. Common stock under $5 with at least $100,000 of dollar volume. Blank catalyst, structure, and attention were not observed.` : 'No penny-screen gem candidates yet.'}</p></div></div>
    {candidates.length ? <div className="table-scroll"><table className="command-table"><thead><tr><th>Ticker</th><th>Price</th><th>Gem</th><th>Liquidity</th><th>Catalyst</th><th>Structure</th><th>Attention gap</th><th>Why</th></tr></thead><tbody>{candidates.map((candidate) => {
      const row = candidate as { symbol?: string; price?: number | null; gemScore?: number | null; liquidityScore?: number | null; catalystScore?: number | null; structureScore?: number | null; attentionGapScore?: number | null; reasons?: string[] };
      const cell = (value: number | null | undefined) => value == null ? '—' : value;
      const price = row.price == null || !Number.isFinite(Number(row.price)) ? '—' : `$${Number(row.price).toFixed(Number(row.price) < 1 ? 4 : 2)}`;
      return <tr key={row.symbol}><td><b>{row.symbol}</b></td><td>{price}</td><td>{cell(row.gemScore)}</td><td>{cell(row.liquidityScore)}</td><td>{cell(row.catalystScore)}</td><td>{cell(row.structureScore)}</td><td>{cell(row.attentionGapScore)}</td><td><small>{row.reasons?.slice(0, 2).join(' · ') || '—'}</small></td></tr>;
    })}</tbody></table></div> : <BoardState loading={gems.loading} error={gems.error} empty="No gem candidates returned." />}
    <ReportDisclosure data={candidates.length ? { count: total, sample: candidates.slice(0, 3) } : gems.data} />
  </article>;
}

export function SocialRadarBoard({ refreshToken }: { refreshToken: number }) {
  const trends = useReport('/api/social/trends', refreshToken);
  const reputation = useReport('/api/research/source-reputation?limit=10', refreshToken);
  const trendRows = Array.isArray(trends.data?.trends) ? trends.data.trends : [];
  const sources = Array.isArray(reputation.data?.sources) ? reputation.data.sources : [];
  return <section className="board-split" aria-label="Social radar board">
    <article className="surface deck-card">
      <div className="section-head"><div><h2>Social trends</h2><p>{trends.loading ? 'Reading social observations.' : `${text(trends.data?.signalsChecked, '0')} signals checked. Empty means no social observations, not a quiet market.`}</p></div></div>
      {trendRows.length ? trendRows.slice(0, 12).map((trend) => {
        const row = trend as { symbol?: string; phrase?: string; score?: number };
        return <div className="provider-row" key={`${row.symbol}-${row.phrase}`}><span>{row.symbol ?? row.phrase}</span><b>{text(row.score)}</b></div>;
      }) : <BoardState loading={trends.loading} error={trends.error} empty="No social trends are stored." />}
    </article>
    <article className="surface deck-card">
      <div className="section-head"><div><h2>Source reputation</h2><p>Reputation appears after outcome-linked observations mature.</p></div></div>
      {sources.length ? sources.slice(0, 10).map((source) => {
        const row = source as { source_ref?: string; source_type?: string; reliability_score?: number; observations?: number };
        return <div className="provider-row" key={`${row.source_type}:${row.source_ref}`}><span>{row.source_ref}<small className="muted2"> {row.source_type}</small></span><b>{text(row.reliability_score)}</b></div>;
      }) : <BoardState loading={reputation.loading} error={reputation.error} empty="No source reputation rows yet." />}
    </article>
  </section>;
}

export function ShadowBookBoard({ refreshToken }: { refreshToken: number }) {
  const book = useReport('/api/portfolio/shadow', refreshToken);
  const positions = Array.isArray(book.data?.positions) ? book.data.positions : [];
  const gross = num(book.data?.gross_exposure ?? book.data?.grossExposure);
  return <article className="surface opportunity-card">
    <div className="section-head"><div><h2>Shadow book</h2><p>Research weights only. These rows do not place orders.</p></div></div>
    <div className="deck-stats">
      <div><span>Gross exposure</span><b>{gross == null ? '—' : money(gross)}</b></div>
      <div><span>Concentration</span><b>{text(book.data?.concentration_score ?? book.data?.concentrationScore)}</b></div>
      <div><span>Regime</span><b>{text(book.data?.regime)}</b></div>
      <div><span>Capital</span><b className="warn">LOCKED</b></div>
    </div>
    {positions.length ? <div className="table-scroll"><table className="command-table"><thead><tr><th>Ticker</th><th>Action</th><th>Weight</th><th>Notional</th><th>Quality</th><th>Fill odds</th></tr></thead><tbody>{positions.slice(0, 20).map((position) => {
      const row = position as { symbol?: string; action?: string; weightPct?: number; notional?: number; qualityScore?: number; execution?: { estimatedFillProbabilityPct?: number } };
      return <tr key={row.symbol}><td><b>{row.symbol}</b></td><td>{text(row.action)}</td><td>{row.weightPct == null ? '—' : `${row.weightPct}%`}</td><td>{row.notional == null ? '—' : money(row.notional)}</td><td>{text(row.qualityScore)}</td><td>{row.execution?.estimatedFillProbabilityPct == null ? '—' : `${row.execution.estimatedFillProbabilityPct}%`}</td></tr>;
    })}</tbody></table></div> : <BoardState loading={book.loading} error={book.error} empty="No shadow positions are stored." />}
  </article>;
}

export function KillSwitchBoard({ refreshToken }: { refreshToken: number }) {
  const risk = useReport('/api/risk/kill-switches', refreshToken);
  const switches = Array.isArray(risk.data?.switches) ? risk.data.switches : [];
  return <article className="surface deck-card">
    <div className="section-head"><div><h2>Kill switches</h2><p>{risk.loading ? 'Reading the kill switch network.' : `${text(risk.data?.criticalTrips, '0')} critical trips · ${text(risk.data?.warnings, '0')} warnings. Research execution stays off.`}</p></div></div>
    {switches.length ? <div className="switch-list">{switches.map((item) => {
      const row = item as { key?: string; label?: string; tripped?: boolean; severity?: string; detail?: string };
      return <div className="switch-row" key={row.key}><span><b>{row.label}</b><small>{row.detail}</small></span><b className={row.tripped ? 'danger' : 'good'}>{row.tripped ? 'TRIPPED' : 'CLEAR'}</b></div>;
    })}</div> : <BoardState loading={risk.loading} error={risk.error} empty="Kill switch network did not return." />}
    <ReportDisclosure data={risk.data} />
  </article>;
}

export function ResearchStatusBoard({ refreshToken }: { refreshToken: number }) {
  const proof = useReport('/api/integrations/research-proof', refreshToken);
  const history = useReport('/api/research/history', refreshToken);
  const coverage = (history.data?.coverage ?? null) as { bars?: number; securities?: number; first_bar?: string | null; last_bar?: string | null } | null;
  return <section className="board-split" aria-label="Research status board">
    <article className="surface deck-card">
      <div className="section-head"><div><h2>Research proof</h2><p>Sidecar status. A failed fetch does not count as proof.</p></div></div>
      <div className="deck-stats">
        <div><span>Available</span><b className={proof.data?.available ? 'good' : 'warn'}>{proof.data ? (proof.data.available ? 'YES' : 'NO') : '—'}</b></div>
        <div><span>Configured</span><b>{proof.data?.configured == null ? '—' : proof.data.configured ? 'YES' : 'NO'}</b></div>
        <div><span>Latency</span><b>{proof.data?.latencyMs == null ? '—' : `${proof.data.latencyMs} ms`}</b></div>
      </div>
      <p className="muted2">{proof.loading ? 'Loading…' : text(proof.data?.reason, proof.error ?? 'No extra status.')}</p>
    </article>
    <article className="surface deck-card">
      <div className="section-head"><div><h2>Historical coverage</h2><p>Replay bars stored for research. This is separate from the delayed quote tape.</p></div></div>
      <div className="deck-stats">
        <div><span>Bars</span><b>{coverage?.bars ?? 0}</b></div>
        <div><span>Securities</span><b>{coverage?.securities ?? 0}</b></div>
        <div><span>Span</span><b>{coverage?.first_bar && coverage?.last_bar ? `${coverage.first_bar} → ${coverage.last_bar}` : '—'}</b></div>
      </div>
    </article>
  </section>;
}

export function ModelRegistryBoard({ refreshToken }: { refreshToken: number }) {
  const governance = useReport('/api/models/governance', refreshToken);
  const deep = useReport('/api/intelligence/deep', refreshToken);
  const champions = Array.isArray(governance.data?.champions) ? governance.data.champions.length : 0;
  const challengers = Array.isArray(governance.data?.challengers) ? governance.data.challengers.length : 0;
  const retired = Array.isArray(governance.data?.retired) ? governance.data.retired.length : 0;
  const experiments = Array.isArray(governance.data?.experiments) ? governance.data.experiments.length : 0;
  return <section className="board-stack" aria-label="Model registry board">
    <div className="deck-kpis">
      <article className="deck-kpi"><span>Champions</span><strong>{champions}</strong><small>promoted models</small></article>
      <article className="deck-kpi"><span>Challengers</span><strong>{challengers}</strong><small>under review</small></article>
      <article className="deck-kpi"><span>Retired</span><strong>{retired}</strong><small>no longer scored</small></article>
      <article className="deck-kpi"><span>Experiments</span><strong>{experiments}</strong><small>recorded runs</small></article>
      <article className="deck-kpi"><span>Structures</span><strong>{text(deep.data?.structures, '0')}</strong><small>share structure rows</small></article>
      <article className="deck-kpi"><span>Catalysts</span><strong>{text(deep.data?.catalysts, '0')}</strong><small>catalyst rows</small></article>
    </div>
    <article className="surface deck-card">
      <div className="section-head"><div><h2>Model registry</h2><p>{governance.data?.available === false ? 'The model registry is empty until a warehouse is connected.' : 'No champion is authorized to trade. Capital execution stays locked.'}</p></div></div>
      <div className="deck-stats">
        <div><span>Ownership rows</span><b>{text(deep.data?.ownership, '0')}</b></div>
        <div><span>Dynamics rows</span><b>{text(deep.data?.dynamics, '0')}</b></div>
        <div><span>Shadow only</span><b className="warn">{deep.data?.shadowOnly === false ? 'NO' : 'YES'}</b></div>
      </div>
    </article>
  </section>;
}

export function EventFeed({ refreshToken }: { refreshToken: number }) {
  const events = useReport('/api/events/recent?limit=12', refreshToken);
  const rows = Array.isArray(events.data?.events) ? events.data.events : [];
  return <article className="surface deck-card">
    <div className="section-head"><div><h2>System events</h2><p>Latest warehouse events. Filing rows are research context.</p></div></div>
    {rows.length ? rows.map((event) => {
      const row = event as { id?: string; category?: string; severity?: string; message?: string; observedAt?: string; source?: string };
      return <div className="event-line" key={row.id}><b className={row.severity === 'high' || row.severity === 'critical' ? 'warn' : ''}>{text(row.severity)}</b><span>{row.message}<small>{row.category} · {row.source}</small></span><small>{row.observedAt ? new Date(row.observedAt).toLocaleTimeString() : ''}</small></div>;
    }) : <BoardState loading={events.loading} error={events.error} empty="No system events stored." />}
  </article>;
}
