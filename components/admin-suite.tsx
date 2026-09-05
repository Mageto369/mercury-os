"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  KeyRound,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

type CatalogItem = {
  id: string;
  category: string;
  provider: string;
  displayName: string;
  capabilities: readonly string[];
  secretName: string;
  defaultBaseUrl?: string;
  defaultModel?: string;
};
type SavedIntegration = {
  id: string;
  enabled: boolean;
  base_url?: string | null;
  model?: string | null;
  health_status?: string;
  secret_configured?: boolean;
  masked_hint?: string | null;
};
type IngestionCatalog = {
  key: string;
  displayName: string;
  cadenceMinutes: number;
  batchSize: number;
};
type SavedIngestion = {
  pipeline_key: string;
  enabled: boolean;
  cadence_minutes: number;
  batch_size: number;
  last_status?: string;
  last_run_at?: string | null;
};
type AdminTab = "Integrations" | "Ingestion" | "Monitoring" | "Audit";

export function AdminSuite() {
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<AdminTab>("Integrations");
  async function load() {
    setError("");
    const [a, h] = await Promise.all([
      fetch("/api/admin/settings", { cache: "no-store" }),
      fetch("/api/health", { cache: "no-store" }),
    ]);
    if (!a.ok) {
      setError(`Admin settings HTTP ${a.status}`);
      return;
    }
    setData(await a.json());
    setHealth(await h.json().catch(() => null));
  }
  useEffect(() => {
    void load();
  }, []);
  if (!data)
    return (
      <StateCard
        title="Loading configuration"
        detail="Reading integrations, ingestion settings and monitoring state…"
      />
    );
  const saved = new Map<string, SavedIntegration>(
    (data.integrations ?? []).map((x: SavedIntegration) => [x.id, x]),
  );
  const ingSaved = new Map<string, SavedIngestion>(
    (data.ingestion ?? []).map((x: SavedIngestion) => [x.pipeline_key, x]),
  );
  const configuredCount = (data.integrations ?? []).filter(
    (x: SavedIntegration) => x.enabled,
  ).length;
  const enabledPipelines = (data.ingestion ?? []).filter(
    (x: SavedIngestion) => x.enabled,
  ).length;
  return (
    <div className="admin-console">
      <section className="admin-overview">
        <div>
          <div className="eyebrow">Personal server workspace</div>
          <h2>System administration</h2>
          <p>
            Configure providers, control ingestion and monitor Mercury from one
            open workspace.
          </p>
        </div>
        <div className="admin-actions">
          <button
            className="icon-button"
            onClick={() => void load()}
            aria-label="Refresh admin"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </section>
      {error && <div className="surface danger admin-alert">{error}</div>}
      <section className="admin-kpis">
        <AdminKpi
          label="Database"
          value={health?.runtime?.databaseReachable ? "Live" : "Offline"}
          tone={health?.runtime?.databaseReachable ? "good" : "danger"}
        />
        <AdminKpi
          label="Schema"
          value={health?.runtime?.schemaReady ? "Ready" : "Waiting"}
          tone={health?.runtime?.schemaReady ? "good" : "warn"}
        />
        <AdminKpi label="Credential store" value="Plaintext" tone="warn" />
        <AdminKpi
          label="Enabled integrations"
          value={String(configuredCount)}
          tone={configuredCount ? "good" : "warn"}
        />
        <AdminKpi
          label="Pipelines"
          value={String(enabledPipelines)}
          tone={enabledPipelines ? "good" : "warn"}
        />
        <AdminKpi label="Capital" value="Locked" tone="warn" />
      </section>
      <nav className="admin-tabs">
        {(
          ["Integrations", "Ingestion", "Monitoring", "Audit"] as AdminTab[]
        ).map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item === "Integrations" ? (
              <KeyRound size={15} />
            ) : item === "Ingestion" ? (
              <ServerCog size={15} />
            ) : item === "Monitoring" ? (
              <Activity size={15} />
            ) : (
              <ShieldCheck size={15} />
            )}
            <span>{item}</span>
          </button>
        ))}
      </nav>

      {tab === "Integrations" && (
        <section className="surface admin-section">
          <div className="admin-section-head">
            <div>
              <h2>API & LLM Integrations</h2>
              <p>
                Add or rotate provider credentials, choose models and enable
                only the integrations you want Mercury to use.
              </p>
            </div>
          </div>
          <div className="integration-grid">
            {(data.catalog as CatalogItem[]).map((item) => (
              <IntegrationCard
                key={item.id}
                item={item}
                saved={saved.get(item.id)}
                onSaved={load}
              />
            ))}
          </div>
        </section>
      )}
      {tab === "Ingestion" && (
        <section className="surface admin-section">
          <div className="admin-section-head">
            <div>
              <h2>Data ingestion</h2>
              <p>
                Control which pipelines run, how often they run and how much
                data each cycle processes.
              </p>
            </div>
          </div>
          <div className="ingestion-list">
            {(data.ingestionCatalog as IngestionCatalog[]).map((item) => (
              <IngestionCard
                key={item.key}
                item={item}
                saved={ingSaved.get(item.key)}
                onSaved={load}
              />
            ))}
          </div>
        </section>
      )}
      {tab === "Monitoring" && (
        <section className="monitor-grid">
          <Monitor title="Runtime Diagnostics" route="/api/health" />
          <Monitor
            title="Market Provider Fabric"
            route="/api/providers/market/status"
          />
          <Monitor
            title="Open Data Mesh"
            route="/api/providers/open-data/status"
          />
          <Monitor
            title="Open Intelligence"
            route="/api/integrations/open-intelligence"
          />
          <Monitor
            title="Research Proof"
            route="/api/integrations/research-proof"
          />
        </section>
      )}
      {tab === "Audit" && (
        <section className="surface admin-section">
          <div className="admin-section-head">
            <div>
              <h2>Admin audit trail</h2>
              <p>
                Recent configuration changes. Credential values are never
                written to the audit log.
              </p>
            </div>
          </div>
          <div className="audit-list">
            {(data.audit ?? []).length ? (
              (data.audit ?? []).map((x: any, i: number) => (
                <div className="audit-row" key={i}>
                  <div>
                    <b>
                      {x.action} {x.target_type}
                    </b>
                    <span>{x.target_ref ?? "—"}</span>
                  </div>
                  <div>
                    <b className={x.outcome === "success" ? "good" : "warn"}>
                      {x.outcome}
                    </b>
                    <span>{new Date(x.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-empty">No admin changes recorded yet.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function AdminKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "danger";
}) {
  return (
    <div className="admin-kpi">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}
function IntegrationCard({
  item,
  saved,
  onSaved,
}: {
  item: CatalogItem;
  saved?: SavedIntegration;
  onSaved: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [baseUrl, setBaseUrl] = useState(
    saved?.base_url ?? item.defaultBaseUrl ?? "",
  );
  const [model, setModel] = useState(
    saved?.model ?? item.defaultModel ?? "",
  );
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true);
    setMessage("");
    const effectiveEnabled = enabled || Boolean(secret);
    const r = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "integration",
        value: {
          id: item.id,
          enabled: effectiveEnabled,
          baseUrl,
          model,
          secret: secret || undefined,
          secretName: item.secretName,
        },
      }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMessage(j.error ?? `HTTP ${r.status}`);
      return;
    }
    setEnabled(effectiveEnabled);
    setSecret("");
    setMessage(effectiveEnabled ? "Saved and enabled" : "Saved");
    await onSaved();
  }
  return (
    <article className="integration-card">
      <div className="integration-card-head">
        <div>
          <div className="integration-title">{item.displayName}</div>
          <div className="tiny">
            {item.category} · {item.capabilities.join(" · ")}
          </div>
        </div>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>{enabled ? "On" : "Off"}</span>
        </label>
      </div>
      {item.category === "llm" && (
        <label>
          Model
          <input
            placeholder={item.defaultModel ?? "e.g. gpt-5"}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
      )}
      {(item.category === "service" || item.category === "llm") && (
        <label>
          Base URL
          <input
            placeholder={item.defaultBaseUrl ?? "Optional service URL"}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>
      )}
      <label>
        Credential
        <input
          type="password"
          placeholder={
            saved?.secret_configured
              ? `Configured ${saved.masked_hint ?? ""} · enter a new value to rotate`
              : "Paste API key / credential"
          }
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
      </label>
      <div className="integration-footer">
        <span className={saved?.secret_configured ? "good" : "muted2"}>
          {saved?.secret_configured
            ? "Credential configured"
            : "No credential saved"}
        </span>
        <button className="pulse-button" onClick={save} disabled={busy}>
          <Save size={14} />
          {busy ? "Saving…" : secret && !enabled ? "Save and enable" : "Save changes"}
        </button>
      </div>
      {message && (
        <div className={message.startsWith("Saved") ? "good" : "danger"}>{message}</div>
      )}
    </article>
  );
}
function IngestionCard({
  item,
  saved,
  onSaved,
}: {
  item: IngestionCatalog;
  saved?: SavedIngestion;
  onSaved: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [cadence, setCadence] = useState(
    saved?.cadence_minutes ?? item.cadenceMinutes,
  );
  const [batch, setBatch] = useState(saved?.batch_size ?? item.batchSize);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ingestion",
        value: {
          pipelineKey: item.key,
          enabled,
          cadenceMinutes: Number(cadence),
          batchSize: Number(batch),
          sourcePriority: [],
        },
      }),
    });
    setBusy(false);
    await onSaved();
  }
  return (
    <article className="ingestion-row">
      <div className="ingestion-name">
        <b>{item.displayName}</b>
        <span>
          {saved?.last_status ?? "Never run"}
          {saved?.last_run_at
            ? ` · ${new Date(saved.last_run_at).toLocaleString()}`
            : ""}
        </span>
      </div>
      <label className="switch-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>{enabled ? "Enabled" : "Paused"}</span>
      </label>
      <label>
        Cadence
        <input
          type="number"
          min={1}
          max={10080}
          value={cadence}
          onChange={(e) => setCadence(Number(e.target.value))}
        />
        <small>minutes</small>
      </label>
      <label>
        Batch
        <input
          type="number"
          min={1}
          max={10000}
          value={batch}
          onChange={(e) => setBatch(Number(e.target.value))}
        />
        <small>records</small>
      </label>
      <button className="pulse-button" onClick={save} disabled={busy}>
        <Save size={14} />
        {busy ? "Saving…" : "Save"}
      </button>
    </article>
  );
}
function Monitor({ title, route }: { title: string; route: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(route, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, [route]);
  const values = useMemo(
    () =>
      data
        ? Object.entries(data)
            .filter(([, v]) => typeof v !== "object")
            .slice(0, 8)
        : [],
    [data],
  );
  return (
    <article className="surface monitor-card">
      <div>
        <h3>{title}</h3>
        <span>{route}</span>
      </div>
      {error ? (
        <div className="danger">{error}</div>
      ) : values.length ? (
        values.map(([k, v]) => (
          <div className="monitor-row" key={k}>
            <span>{k.replaceAll("_", " ")}</span>
            <b>{String(v)}</b>
          </div>
        ))
      ) : (
        <div className="admin-empty">Loading status…</div>
      )}
    </article>
  );
}
function StateCard({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="admin-state-card">
      <RefreshCw className="spin" size={20} />
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </section>
  );
}
