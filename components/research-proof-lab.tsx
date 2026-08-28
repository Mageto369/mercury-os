"use client";
import { useEffect, useState } from "react";
import { FlaskConical, RefreshCw, Search, Send } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useEmptyReason } from "@/components/system-state-provider";

type Lab = {
  ok: boolean;
  replayRuns?: any[];
  experiments?: any[];
  replayEvidence?: any[];
  proofMetrics?: any[];
  economicProofGates?: any[];
  monteCarlo?: any;
  evidenceProvenance?: any;
  historicalTwins?: any;
  evidenceLadder?: Array<{ stage: string; status: string }>;
  error?: string;
  detail?: string;
};
export function ResearchProofLab() {
  const [data, setData] = useState<Lab | null>(null);
  const [tab, setTab] = useState<
    "proof" | "replay" | "experiments" | "montecarlo" | "twins"
  >("proof");
  const [opportunityId, setOpportunityId] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [engine, setEngine] = useState("internal");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function load(id = "") {
    const r = await fetch(
      `/api/research/lab${id ? `?opportunityId=${encodeURIComponent(id)}` : ""}`,
      { cache: "no-store" },
    );
    setData(
      await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })),
    );
  }
  useEffect(() => {
    void load();
  }, []);
  async function createExperiment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/research/lab", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        engine,
        hypothesis,
        parameters: { transactionCosts: true, pointInTime: true },
      }),
    });
    const b = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Queued ${b.id}` : (b.error ?? `HTTP ${r.status}`));
    if (r.ok) {
      setHypothesis("");
      await load();
    }
    setBusy(false);
  }
  return (
    <div className="admin-console">
      <section className="admin-overview">
        <div>
          <div className="eyebrow">Evidence before promotion</div>
          <h2>Research & Proof Lab</h2>
          <p>
            Historical replay, walk-forward evidence, bootstrap stress testing,
            historical twins, experiments and the economic-proof ladder.
          </p>
        </div>
        <button
          className="icon-button"
          onClick={() => void load(opportunityId)}
        >
          <RefreshCw size={16} />
        </button>
      </section>
      <div className="admin-tabs">
        {(
          ["proof", "replay", "experiments", "montecarlo", "twins"] as const
        ).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "montecarlo"
              ? "Monte Carlo"
              : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {data?.error && (
        <section className="surface admin-section danger">
          {data.error}: {data.detail ?? ""}
        </section>
      )}
      {tab === "proof" && (
        <>
          <section className="surface admin-section">
            <div className="section-head">
              <div>
                <h2>Economic Evidence Ladder</h2>
                <p>
                  No stage grants real-capital authority. Capital stages stay
                  locked.
                </p>
              </div>
              <FlaskConical size={18} />
            </div>
            <div className="paper-facts paper-metrics">
              {data?.evidenceLadder?.map((x) => (
                <div key={x.stage}>
                  <span>{x.stage}</span>
                  <b
                    className={
                      x.status === "passed" || x.status === "active"
                        ? "good"
                        : x.status === "locked"
                          ? "warn"
                          : ""
                    }
                  >
                    {x.status.toUpperCase()}
                  </b>
                </div>
              ))}
            </div>
          </section>
          <section className="surface admin-section">
            <h2>Economic Proof Gates</h2>
            <DataTable
              rows={data?.economicProofGates ?? []}
              columns={[
                "model_version",
                "sample_size",
                "regimes",
                "net_expectancy",
                "max_drawdown",
                "ex_top_winners_expectancy",
                "synthetic_rows",
                "passed",
                "evaluated_at",
              ]}
            />
          </section>
          {data?.evidenceProvenance && (
            <section className="surface admin-section">
              <div className="section-head">
                <div>
                  <h2>Evidence Provenance</h2>
                  <p>
                    Measured before and after the synthetic/validation filter,
                    so a clean result is distinguishable from a filter that
                    never ran.
                  </p>
                </div>
                <span
                  className={`badge ${!data.evidenceProvenance.provenanceSafe ? "danger" : data.evidenceProvenance.vacuous ? "warn" : "good"}`}
                >
                  {!data.evidenceProvenance.provenanceSafe
                    ? "CONTAMINATED"
                    : data.evidenceProvenance.vacuous
                      ? "UNPROVEN"
                      : "FILTERED"}
                </span>
              </div>
              <div className="paper-facts paper-metrics">
                <Metric
                  k="Candidate rows"
                  v={data.evidenceProvenance.candidateRows}
                />
                <Metric
                  k="Synthetic present"
                  v={data.evidenceProvenance.syntheticCandidates}
                />
                <Metric
                  k="Synthetic excluded"
                  v={data.evidenceProvenance.syntheticExcluded}
                />
                <Metric
                  k="Live surviving"
                  v={data.evidenceProvenance.liveSurviving}
                />
                <Metric
                  k="Synthetic surviving"
                  v={data.evidenceProvenance.syntheticSurviving}
                />
                <Metric
                  k="Filtering observed"
                  v={data.evidenceProvenance.filteringObserved ? "YES" : "NO"}
                />
              </div>
              {(data.evidenceProvenance.contaminationReasons ?? []).map(
                (reason: string) => (
                  <p
                    key={reason}
                    className={`mc-warning ${data.evidenceProvenance.provenanceSafe ? "warn" : "danger"}`}
                  >
                    {reason}
                  </p>
                ),
              )}
            </section>
          )}
          <section className="surface admin-section">
            <h2>Proof Metrics</h2>
            <DataTable
              rows={data?.proofMetrics ?? []}
              columns={[
                "model_version",
                "expectancy",
                "sharpe",
                "sortino",
                "max_drawdown",
                "profit_factor",
                "win_rate",
                "monte_carlo_ruin_probability",
                "source_engine",
                "as_of",
              ]}
            />
          </section>
        </>
      )}
      {tab === "replay" && (
        <>
          <section className="surface admin-section">
            <div className="section-head">
              <div>
                <h2>Historical Replay Lab</h2>
                <p>Existing point-in-time replay runs and drift evidence.</p>
              </div>
            </div>
            <DataTable
              rows={data?.replayRuns ?? []}
              columns={[
                "model_version",
                "status",
                "lookback_days",
                "opportunities_reviewed",
                "decisions_reviewed",
                "drift_detected",
                "started_at",
                "completed_at",
              ]}
            />
          </section>
          <section className="surface admin-section">
            <h2>Walk-Forward / Leakage Evidence</h2>
            <DataTable
              rows={data?.replayEvidence ?? []}
              columns={[
                "model_version",
                "regime",
                "dataset_hash",
                "point_in_time",
                "walk_forward",
                "leakage_passed",
                "transaction_costs_included",
                "created_at",
              ]}
            />
          </section>
        </>
      )}
      {tab === "experiments" && (
        <div className="hero-grid">
          <form className="surface admin-section" onSubmit={createExperiment}>
            <h2>Strategy Experiment Builder</h2>
            <p className="muted2">
              Queues research metadata only. It does not deploy models or
              execute capital.
            </p>
            <label className="tiny">
              Engine
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value)}
              >
                <option value="internal">Internal</option>
                <option value="vectorbt">VectorBT</option>
                <option value="backtrader">Backtrader</option>
              </select>
            </label>
            <label className="tiny">
              Hypothesis
              <textarea
                rows={6}
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder="Describe the falsifiable research hypothesis…"
                required
              />
            </label>
            <button className="pulse-button" disabled={busy}>
              <Send size={14} />
              {busy ? "Queueing…" : "Queue Research Experiment"}
            </button>
            {msg && <div className="tiny">{msg}</div>}
          </form>
          <section className="surface admin-section">
            <h2>Experiment Registry</h2>
            <DataTable
              rows={data?.experiments ?? []}
              columns={[
                "engine",
                "model_version",
                "hypothesis",
                "status",
                "shadow_only",
                "started_at",
                "completed_at",
              ]}
            />
          </section>
        </div>
      )}
      {tab === "montecarlo" && (
        <section className="surface admin-section">
          <div className="section-head">
            <div>
              <h2>Monte Carlo Laboratory</h2>
              <p>
                Bootstrap resampling of matured live 60-minute opportunity
                returns. Percentiles require at least 100 live observations.
              </p>
            </div>
          </div>
          {data?.monteCarlo?.available ? (
            <>
              <div className="paper-facts paper-metrics">
                <Metric
                  k="Observations"
                  v={data.monteCarlo.sourceObservations}
                />
                <Metric
                  k="Evidence status"
                  v={String(data.monteCarlo.evidenceStatus).toUpperCase()}
                />
                <Metric k="Simulations" v={data.monteCarlo.simulations} />
                <Metric k="Trades / path" v={data.monteCarlo.tradesPerPath} />
                <Metric
                  k="Median return"
                  v={`${Number(data.monteCarlo.medianReturnPct).toFixed(2)}%`}
                />
                <Metric
                  k="5th pct return"
                  v={`${Number(data.monteCarlo.p05ReturnPct).toFixed(2)}%`}
                />
                <Metric
                  k="Median max DD"
                  v={`${Number(data.monteCarlo.medianMaxDrawdownPct).toFixed(2)}%`}
                />
                <Metric
                  k="Ruin probability"
                  v={`${Number(data.monteCarlo.ruinProbabilityPct).toFixed(2)}%`}
                />
                <Metric
                  k="Economic proof sample floor"
                  v={
                    data.monteCarlo.meetsEconomicProofSampleFloor
                      ? "MET"
                      : "NOT MET"
                  }
                />
                <Metric k="Authority" v="RESEARCH ONLY" />
              </div>
              <div className="paper-empty">
                <b>Evidence limitations</b>
                <span>{(data.monteCarlo.limitations ?? []).join(" ")}</span>
              </div>
            </>
          ) : (
            <div className="paper-empty">
              <b>Monte Carlo unavailable</b>
              <span>
                {data?.monteCarlo?.reason ?? "No live outcomes."}{" "}
                {Number(data?.monteCarlo?.sourceObservations ?? 0)} of{" "}
                {Number(data?.monteCarlo?.minimumSourceObservations ?? 100)}
                {" required observations."}
              </span>
            </div>
          )}
        </section>
      )}
      {tab === "twins" && (
        <section className="surface admin-section">
          <div className="section-head">
            <div>
              <h2>Historical Twins Explorer</h2>
              <p>
                Finds live-only historical setups similar to a selected
                opportunity ID.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void load(opportunityId);
              }}
              style={{ display: "flex", gap: 8 }}
            >
              <input
                value={opportunityId}
                onChange={(e) => setOpportunityId(e.target.value)}
                placeholder="Opportunity ID"
                required
              />
              <button className="icon-button">
                <Search size={15} />
              </button>
            </form>
          </div>
          {data?.historicalTwins?.available ? (
            <>
              <div className="paper-facts">
                <Metric k="Twins" v={data.historicalTwins.twinCount} />
                <Metric k="Matured 60m" v={data.historicalTwins.matured60m} />
                <Metric
                  k="Hit rate 60m"
                  v={`${data.historicalTwins.hitRate60mPct}%`}
                />
                <Metric
                  k="Avg return 60m"
                  v={`${data.historicalTwins.averageReturn60mPct}%`}
                />
              </div>
              <DataTable
                rows={data.historicalTwins.twins ?? []}
                columns={[
                  "symbol",
                  "state",
                  "action",
                  "alpha",
                  "asymmetry",
                  "distance",
                  "return_60m",
                  "mfe_60m",
                  "mae_60m",
                  "observed_at",
                ]}
              />
            </>
          ) : (
            <div className="paper-empty">
              <b>No twins loaded</b>
              <span>
                Enter a live opportunity ID. Validation opportunities are
                excluded.
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
function Metric({ k, v }: { k: string; v: any }) {
  return (
    <div>
      <span>{k}</span>
      <b>{String(v ?? "—")}</b>
    </div>
  );
}
function DataTable({ rows, columns }: { rows: any[]; columns: string[] }) {
  // Research surfaces need matured outcomes, not just ingested rows, so an
  // empty table here has a different cause than an empty market table.
  const reason = useEmptyReason(rows.length, { requiresMaturity: true });
  if (!rows.length) return <EmptyState reason={reason} />;
  return (
    <div className="table-scroll">
      <table className="command-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c.replaceAll("_", " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i}>
              {columns.map((c) => (
                <td key={c}>
                  {r[c] == null
                    ? "—"
                    : typeof r[c] === "object"
                      ? JSON.stringify(r[c]).slice(0, 180)
                      : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
