"use client";

import { useEffect, useState } from "react";
import { Play, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useEmptyReason } from "@/components/system-state-provider";

type Ops = {
  ok: boolean;
  pipelines?: any[];
  providers?: any[];
  workflows?: any[];
  dataQuality?: { counts: any; checks: any; issueCount: number };
  audit?: { systemEvents: any[]; admin: any[] };
  evidenceProvenance?: any;
  notifications?: {
    rules: any[];
    deliveries: any[];
    deliveryHealth?: any;
    rulesNeverDelivered?: any[];
  };
  readiness?: Record<string, any>;
  error?: string;
  detail?: string;
};

type CycleResult = {
  ok: boolean;
  completed?: number;
  degraded?: number;
  skipped?: number;
  pipelineResults?: Record<string, { status: string; error: string | null }>;
  error?: string;
  detail?: string;
};

type Tab = "pipelines" | "quality" | "audit" | "notifications" | "readiness";

export function OperationsCenter() {
  const [data, setData] = useState<Ops | null>(null);
  const [tab, setTab] = useState<Tab>("readiness");
  const [loading, setLoading] = useState(false);
  const [cycleRunning, setCycleRunning] = useState(false);
  const [cycle, setCycle] = useState<CycleResult | null>(null);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/operations/center", { cache: "no-store" });
    setData(
      await response
        .json()
        .catch(() => ({ ok: false, error: `HTTP ${response.status}` })),
    );
    setLoading(false);
  }

  async function runCycle() {
    setCycleRunning(true);
    setCycle(null);
    try {
      const response = await fetch("/api/cron/intelligence", {
        method: "POST",
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({
        ok: false,
        error: `HTTP ${response.status}`,
      }))) as CycleResult;
      setCycle(result);
      await load();
    } catch (error) {
      setCycle({
        ok: false,
        error: error instanceof Error ? error.message : "cycle_failed",
      });
    } finally {
      setCycleRunning(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="admin-console">
      <section className="admin-overview">
        <div>
          <div className="eyebrow">Operational truth</div>
          <h2>Operations Command Center</h2>
          <p>Pipeline health, data quality, audit evidence, notifications and system readiness.</p>
        </div>
        <div className="admin-actions">
          <button className="pulse-button" onClick={() => void runCycle()} disabled={cycleRunning}>
            <Play size={15} />
            {cycleRunning ? "Running full cycle…" : "Run full cycle"}
          </button>
          <button className="icon-button" onClick={() => void load()} aria-label="Refresh operations">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
        </div>
      </section>

      {cycle && <CycleSummary cycle={cycle} />}

      <div className="admin-tabs">
        {(["readiness", "pipelines", "quality", "audit", "notifications"] as const).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {data?.error && <section className="surface admin-section danger">{data.error}: {data.detail ?? ""}</section>}

      {tab === "readiness" && (
        <section className="surface admin-section">
          <div className="section-head">
            <div>
              <h2>System Readiness Center</h2>
              <p>Truthful runtime readiness. Empty live evidence is shown as not ready, not simulated success.</p>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div className="paper-facts paper-metrics">
            {Object.entries(data?.readiness ?? {}).map(([key, value]) => (
              <div key={key}>
                <span>{key.replace(/([A-Z])/g, " $1")}</span>
                <b className={value === true ? "good" : value === false ? "warn" : ""}>
                  {typeof value === "boolean" ? (value ? "READY" : "NOT READY") : String(value)}
                </b>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "pipelines" && (
        <>
          <TableSection title="Data Pipeline Command Center" rows={data?.pipelines ?? []} columns={["display_name", "enabled", "cadence_minutes", "batch_size", "last_run_at", "last_status", "last_error"]} />
          <TableSection title="Provider Health" rows={data?.providers ?? []} columns={["provider", "provider_group", "configured", "authoritative", "last_status", "latency_ms", "records_received", "consecutive_failures", "last_success_at", "last_error"]} />
          <TableSection title="Recent Workflow Runs" rows={data?.workflows ?? []} columns={["workflow", "status", "trigger", "started_at", "completed_at", "error"]} />
        </>
      )}

      {tab === "quality" && (
        <section className="surface admin-section">
          <div className="section-head">
            <div>
              <h2>Data Quality Observatory</h2>
              <p>Missing, invalid, stale, duplicate and validation-leak checks against the live warehouse.</p>
            </div>
            <span className={`badge ${(data?.dataQuality?.issueCount ?? 0) > 0 ? "warn" : "good"}`}>
              {data?.dataQuality?.issueCount ?? 0} ISSUES
            </span>
          </div>
          <div className="paper-facts paper-metrics">
            {Object.entries(data?.dataQuality?.counts ?? {}).map(([key, value]) => (
              <div key={key}><span>{key.replaceAll("_", " ")}</span><b>{String(value)}</b></div>
            ))}
            {Object.entries(data?.dataQuality?.checks ?? {}).map(([key, value]) => (
              <div key={key}><span>{key.replaceAll("_", " ")}</span><b className={Number(value) > 0 ? "warn" : "good"}>{String(value)}</b></div>
            ))}
          </div>
        </section>
      )}

      {tab === "audit" && (
        <>
          <TableSection title="System Event Explorer" rows={data?.audit?.systemEvents ?? []} columns={["observed_at", "severity", "category", "source", "message", "event_key"]} />
          <TableSection title="Admin Audit Explorer" rows={data?.audit?.admin ?? []} columns={["created_at", "action", "target_type", "target_ref", "outcome"]} />
        </>
      )}

      {tab === "notifications" && <Notifications data={data} reload={load} />}
    </div>
  );
}

function CycleSummary({ cycle }: { cycle: CycleResult }) {
  if (!cycle.ok) {
    return <section className="surface admin-section danger">Cycle failed: {cycle.error ?? cycle.detail ?? "unknown_error"}</section>;
  }
  const rows = Object.entries(cycle.pipelineResults ?? {}).map(([pipeline, result]) => ({ pipeline, ...result }));
  return (
    <section className="surface admin-section">
      <div className="section-head">
        <div><h2>Latest manual cycle</h2><p>All enabled pipelines ran immediately and persisted one result.</p></div>
        <span className={`badge ${(cycle.degraded ?? 0) > 0 ? "warn" : "good"}`}>
          {cycle.completed ?? 0} completed · {cycle.degraded ?? 0} degraded · {cycle.skipped ?? 0} skipped
        </span>
      </div>
      <DataTable rows={rows} columns={["pipeline", "status", "error"]} />
    </section>
  );
}

function TableSection({ title, rows, columns }: { title: string; rows: any[]; columns: string[] }) {
  return <section className="surface admin-section"><h2>{title}</h2><DataTable rows={rows} columns={columns} /></section>;
}

function Notifications({ data, reload }: { data: Ops | null; reload: () => Promise<void> }) {
  return (
    <>
      <section className="surface admin-section">
        <div className="section-head"><div><h2>Notification Center</h2><p>Rules are shadow and operational alerts only. External delivery requires a configured delivery integration.</p></div></div>
        <div className="ingestion-list">
          {(data?.notifications?.rules ?? []).map((rule) => <NotificationRule key={rule.id} rule={rule} onSaved={reload} />)}
        </div>
      </section>
      <section className="surface admin-section">
        <h2>Delivery History</h2>
        <p className="mc-warning">Every matched rule records one row. <b>delivered</b> means the channel accepted it. <b>unavailable</b> means the channel lacks credentials. <b>failed</b> means the transport rejected it. <b>skipped</b> means a cooldown suppressed it.</p>
        <DataTable rows={data?.notifications?.deliveries ?? []} columns={["created_at", "severity", "rule_key", "channel", "destination", "status", "reason", "attempts", "delivered_at", "error"]} />
      </section>
      {data?.notifications?.deliveryHealth && (
        <section className="surface admin-section">
          <h2>Delivery Health (24h)</h2>
          <div className="paper-facts paper-metrics">
            <Metric k="Total" v={data.notifications.deliveryHealth.total} />
            <Metric k="Delivered" v={data.notifications.deliveryHealth.delivered} />
            <Metric k="Skipped" v={data.notifications.deliveryHealth.skipped} />
            <Metric k="Unavailable" v={data.notifications.deliveryHealth.unavailable} />
            <Metric k="Failed" v={data.notifications.deliveryHealth.failed} />
          </div>
          {(data.notifications.rulesNeverDelivered ?? []).length > 0 && (
            <><p className="mc-warning warn">{(data.notifications.rulesNeverDelivered ?? []).length} enabled rule(s) have never delivered successfully:</p><DataTable rows={data.notifications.rulesNeverDelivered ?? []} columns={["rule_key", "display_name", "channel"]} /></>
          )}
        </section>
      )}
      {data?.evidenceProvenance && (
        <section className="surface admin-section">
          <div className="section-head">
            <div><h2>Warehouse Provenance Census</h2><p>Counts all opportunity rows without pretending a downstream evidence filter ran.</p></div>
            <span className={`badge ${data.evidenceProvenance.syntheticSurviving > 0 ? "warn" : data.evidenceProvenance.candidateRows > 0 ? "good" : "warn"}`}>
              {data.evidenceProvenance.syntheticSurviving > 0 ? "MIXED" : data.evidenceProvenance.candidateRows > 0 ? "LIVE ONLY" : "EMPTY"}
            </span>
          </div>
          <div className="paper-facts paper-metrics">
            <Metric k="Candidate rows" v={data.evidenceProvenance.candidateRows} />
            <Metric k="Synthetic rows" v={data.evidenceProvenance.syntheticSurviving} />
            <Metric k="Live rows" v={data.evidenceProvenance.liveSurviving} />
          </div>
          {(data.evidenceProvenance.contaminationReasons ?? []).map((reason: string) => <p key={reason} className="mc-warning warn">{reason}</p>)}
        </section>
      )}
    </>
  );
}

function NotificationRule({ rule, onSaved }: { rule: any; onSaved: () => Promise<void> }) {
  const [enabled, setEnabled] = useState(Boolean(rule.enabled));
  const [severity, setSeverity] = useState(rule.minimum_severity ?? "high");
  const [channel, setChannel] = useState(rule.channel ?? "dashboard");
  const [destination, setDestination] = useState(rule.destination ?? "");
  const [cooldown, setCooldown] = useState(Number(rule.cooldown_minutes ?? 60));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await fetch("/api/operations/notifications", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled, minimumSeverity: severity, channel, destination: destination || null, cooldownMinutes: cooldown }),
    });
    setBusy(false);
    await onSaved();
  }
  return (
    <div className="ingestion-row">
      <div className="ingestion-name"><b>{rule.display_name}</b><span>{rule.category} · shadow only</span></div>
      <label>Enabled<input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /></label>
      <label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value)}><option>info</option><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
      <label>Channel<select value={channel} onChange={(event) => setChannel(event.target.value)}><option>dashboard</option><option>email</option><option>slack</option><option>webhook</option></select></label>
      <label>Cooldown<input type="number" min={1} max={10080} value={cooldown} onChange={(event) => setCooldown(Number(event.target.value))} /></label>
      <label>Destination<input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="optional" /></label>
      <button className="icon-button" onClick={save} disabled={busy}><Save size={14} /></button>
    </div>
  );
}

function Metric({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><span>{k}</span><b>{v}</b></div>;
}

function DataTable({ rows, columns }: { rows: any[]; columns: string[] }) {
  const reason = useEmptyReason(rows.length);
  if (!rows.length) return <EmptyState reason={reason} />;
  return (
    <div className="table-scroll">
      <table className="command-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? `${index}`}>
              {columns.map((column) => <td key={column}>{row[column] == null ? "—" : typeof row[column] === "object" ? JSON.stringify(row[column]).slice(0, 180) : String(row[column])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
