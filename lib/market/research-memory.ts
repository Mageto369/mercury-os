import { getSql } from "@/lib/db";
import { toJsonb } from "@/lib/db/json";
import { loadDailyHistory } from "@/lib/market/daily-history";
import { observedCatalystScore, type PricePush } from "@/lib/market/price-push";
import { buildResearchDecision, type JournalProjection, type ResearchDecision } from "@/lib/market/research-journal";
import { labelForwardSession } from "@/lib/market/research-label";
import { DELAYED_REFERENCE_MODEL } from "@/lib/market/research-quotes";
import { scoreResearchBook, type ResearchScorecard, type ScoredResearchRow } from "@/lib/market/research-scorecard";
import { cardHash, RESEARCH_CARD_KEY, RESEARCH_CARD_VERSION, SEED_RULE_CARD } from "@/lib/market/rule-card";

export interface ResearchMemoryResult {
  ok: true;
  cardVersion: string;
  cardHash: string;
  decisions: number;
  labels: number;
  promoted: false;
  capitalExecutionEnabled: false;
  evidenceClass: "delayed-reference";
}

interface RememberRow {
  modelVersion?: string | null;
  input: { symbol?: unknown; price?: number | null };
  decision?: { action?: string | null };
  history?: {
    sessions?: Array<{ date: string }>;
    return5Pct?: number | null;
    relativeVolume?: number | null;
    extension20Pct?: number | null;
    closeLocationPct?: number | null;
    rise?: { score: number | null; room: boolean };
  } | null;
  push?: PricePush | null;
  projection?: (JournalProjection & { room?: boolean }) | null;
}

const CARD_PAYLOAD = {
  brokerAuthority: false,
  capitalExecutionEnabled: false,
  evidenceClass: "delayed-reference",
  teacher: "delayed-daily-5-session",
};

let ready: Promise<void> | null = null;

function asDay(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  return match?.[1] ?? "";
}

function num(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function flag(value: unknown) {
  return value === true || value === "t" || value === "true";
}

async function createAndSeed() {
  const sql = getSql();
  if (!sql) return;
  await sql`CREATE TABLE IF NOT EXISTS research_decisions (
    id text PRIMARY KEY,
    session_date date NOT NULL,
    symbol text NOT NULL,
    card_version text NOT NULL,
    card_hash text NOT NULL,
    evidence_class text NOT NULL,
    price numeric(18,8),
    return_5 numeric(12,4),
    relative_volume numeric(12,4),
    extension_20 numeric(12,4),
    close_location numeric(12,4),
    rise_score numeric(8,2),
    room boolean NOT NULL DEFAULT false,
    blocks_room boolean NOT NULL DEFAULT false,
    social_hype numeric(8,2),
    catalyst_score numeric(8,2),
    rank integer,
    eligible boolean NOT NULL DEFAULT false,
    expectancy_pct numeric(12,4),
    projected_gain_pct numeric(12,4),
    projected_low_pct numeric(12,4),
    projected_high_pct numeric(12,4),
    edge numeric(12,4),
    win_rate_pct numeric(12,4),
    payoff numeric(12,4),
    adverse_pct numeric(12,4),
    favorable_pct numeric(12,4),
    target_first_pct numeric(12,4),
    analogs integer,
    shadow_action text,
    gate_pass boolean NOT NULL DEFAULT false,
    regime text,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    observed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_date, symbol, card_version)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS research_decision_session_idx ON research_decisions(session_date, symbol)`;
  await sql`CREATE TABLE IF NOT EXISTS research_labels (
    id text PRIMARY KEY,
    decision_id text NOT NULL UNIQUE REFERENCES research_decisions(id),
    symbol text NOT NULL,
    session_date date NOT NULL,
    horizon_sessions integer NOT NULL DEFAULT 5,
    forward_5_pct numeric(12,4),
    adverse_pct numeric(12,4),
    favorable_pct numeric(12,4),
    target_first boolean,
    entry_close numeric(18,8),
    exit_close numeric(18,8),
    bar_dates jsonb,
    evidence_class text NOT NULL DEFAULT 'delayed-reference',
    source text NOT NULL DEFAULT 'nasdaq-delayed',
    labeled_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS research_label_session_idx ON research_labels(session_date, symbol)`;
  await sql`
    INSERT INTO model_registry (
      id, model_key, version, role, status, strategy, regime, feature_manifest,
      promotion_metrics, created_at, promoted_at
    ) VALUES (
      ${`model:${RESEARCH_CARD_KEY}:${RESEARCH_CARD_VERSION}`},
      ${RESEARCH_CARD_KEY},
      ${RESEARCH_CARD_VERSION},
      'champion',
      'shadow',
      'penny-analog-rank',
      'all',
      ${toJsonb(SEED_RULE_CARD)}::jsonb,
      ${toJsonb(CARD_PAYLOAD)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (model_key, version) DO NOTHING
  `;
}

export function ensureResearchMemory() {
  if (!ready) {
    ready = createAndSeed().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function writeDecision(decision: ResearchDecision) {
  const sql = getSql();
  if (!sql) return 0;
  const written = await sql<{ id: string }[]>`
    INSERT INTO research_decisions (
      id, session_date, symbol, card_version, card_hash, evidence_class, price,
      return_5, relative_volume, extension_20, close_location, rise_score, room, blocks_room,
      social_hype, catalyst_score, rank, eligible, expectancy_pct, projected_gain_pct,
      projected_low_pct, projected_high_pct, edge, win_rate_pct, payoff, adverse_pct,
      favorable_pct, target_first_pct, analogs, shadow_action, gate_pass, regime, payload, observed_at
    ) VALUES (
      ${decision.id}, ${decision.sessionDate}, ${decision.symbol}, ${decision.cardVersion}, ${decision.cardHash},
      ${decision.evidenceClass}, ${decision.price}, ${decision.return5Pct}, ${decision.relativeVolume},
      ${decision.extension20Pct}, ${decision.closeLocationPct}, ${decision.riseScore}, ${decision.room},
      ${decision.blocksRoom}, ${decision.socialHype}, ${decision.catalystScore}, ${decision.rank},
      ${decision.eligible}, ${decision.expectancyPct}, ${decision.projectedGainPct}, ${decision.projectedLowPct},
      ${decision.projectedHighPct}, ${decision.edge}, ${decision.winRatePct}, ${decision.payoff},
      ${decision.adversePct}, ${decision.favorablePct}, ${decision.targetFirstPct}, ${decision.analogs},
      ${decision.shadowAction}, ${decision.gatePass}, ${decision.regime},
      ${toJsonb({ teacher: "delayed-daily-5-session", shadowOnly: true, capitalExecutionEnabled: false })}::jsonb,
      now()
    )
    ON CONFLICT (session_date, symbol, card_version) DO UPDATE SET
      card_hash = excluded.card_hash,
      evidence_class = excluded.evidence_class,
      price = excluded.price,
      return_5 = excluded.return_5,
      relative_volume = excluded.relative_volume,
      extension_20 = excluded.extension_20,
      close_location = excluded.close_location,
      rise_score = excluded.rise_score,
      room = excluded.room,
      blocks_room = excluded.blocks_room,
      social_hype = excluded.social_hype,
      catalyst_score = excluded.catalyst_score,
      rank = excluded.rank,
      eligible = excluded.eligible,
      expectancy_pct = excluded.expectancy_pct,
      projected_gain_pct = excluded.projected_gain_pct,
      projected_low_pct = excluded.projected_low_pct,
      projected_high_pct = excluded.projected_high_pct,
      edge = excluded.edge,
      win_rate_pct = excluded.win_rate_pct,
      payoff = excluded.payoff,
      adverse_pct = excluded.adverse_pct,
      favorable_pct = excluded.favorable_pct,
      target_first_pct = excluded.target_first_pct,
      analogs = excluded.analogs,
      shadow_action = excluded.shadow_action,
      gate_pass = excluded.gate_pass,
      regime = excluded.regime,
      payload = excluded.payload,
      observed_at = now()
    WHERE NOT EXISTS (
      SELECT 1 FROM research_labels AS labeled WHERE labeled.decision_id = research_decisions.id
    )
    RETURNING id
  `;
  return written.length;
}

export async function refreshResearchLabels(limit = 200) {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: "database_not_configured" as const, labeled: 0, capitalExecutionEnabled: false as const };
  await ensureResearchMemory();
  const pending = await sql<{ id: string; symbol: string; session_date: Date | string }[]>`
    SELECT d.id, d.symbol, d.session_date
    FROM research_decisions d
    LEFT JOIN research_labels l ON l.decision_id = d.id
    WHERE l.id IS NULL
    ORDER BY d.session_date ASC
    LIMIT ${Math.max(1, Math.min(500, limit))}
  `;
  const symbols = [...new Set(pending.map((row) => String(row.symbol).toUpperCase()))];
  const histories = await loadDailyHistory(symbols, 90);
  let labeled = 0;
  for (const row of pending) {
    const sessionDate = asDay(row.session_date);
    const symbol = String(row.symbol).toUpperCase();
    const label = labelForwardSession(histories.get(symbol) ?? [], sessionDate);
    if (!label) continue;
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO research_labels (
        id, decision_id, symbol, session_date, horizon_sessions, forward_5_pct, adverse_pct,
        favorable_pct, target_first, entry_close, exit_close, bar_dates, evidence_class, source
      ) VALUES (
        ${`label:${row.id}`}, ${row.id}, ${symbol}, ${sessionDate}, ${label.horizonSessions},
        ${label.forward5Pct}, ${label.adversePct}, ${label.favorablePct}, ${label.targetFirst},
        ${label.entryClose}, ${label.exitClose}, ${toJsonb(label.barDates)}::jsonb,
        ${label.evidenceClass}, ${label.source}
      )
      ON CONFLICT (decision_id) DO NOTHING
      RETURNING id
    `;
    labeled += inserted.length;
  }
  return { ok: true as const, labeled, capitalExecutionEnabled: false as const };
}

/** Journal the book the command page just ranked. The paper engine does not read these rows. */
export async function rememberRankedBook(input: { regime: string | null; rows: RememberRow[] }): Promise<ResearchMemoryResult> {
  const sql = getSql();
  const hash = cardHash(SEED_RULE_CARD);
  if (!sql) {
    return {
      ok: true,
      cardVersion: RESEARCH_CARD_VERSION,
      cardHash: hash,
      decisions: 0,
      labels: 0,
      promoted: false,
      capitalExecutionEnabled: false,
      evidenceClass: "delayed-reference",
    };
  }
  await ensureResearchMemory();
  const card = { version: RESEARCH_CARD_VERSION, hash, expectancyFloorPct: SEED_RULE_CARD.expectancyFloorPct };
  const decisions = input.rows.flatMap((row) => {
    const decision = buildResearchDecision({
      symbol: String(row.input.symbol ?? ""),
      sessionDate: row.history?.sessions?.[0]?.date ?? "",
      evidenceClass: row.modelVersion === DELAYED_REFERENCE_MODEL ? "delayed-reference" : "live",
      price: row.input.price ?? null,
      return5Pct: row.history?.return5Pct ?? null,
      relativeVolume: row.history?.relativeVolume ?? null,
      extension20Pct: row.history?.extension20Pct ?? null,
      closeLocationPct: row.history?.closeLocationPct ?? null,
      riseScore: row.history?.rise?.score ?? null,
      room: Boolean(row.projection?.room ?? row.history?.rise?.room),
      blocksRoom: Boolean(row.push?.blocksRoom),
      socialHype: row.push?.socialHype ?? null,
      catalystScore: row.push ? observedCatalystScore(row.push) : null,
      shadowAction: row.decision?.action ?? null,
      regime: input.regime,
    }, row.projection ?? null, card);
    return decision ? [decision] : [];
  });
  let written = 0;
  for (const decision of decisions) written += await writeDecision(decision);
  const labels = await refreshResearchLabels();
  return {
    ok: true,
    cardVersion: RESEARCH_CARD_VERSION,
    cardHash: hash,
    decisions: written,
    labels: labels.labeled,
    promoted: false,
    capitalExecutionEnabled: false,
    evidenceClass: "delayed-reference",
  };
}

/** Store today's grade. A recorded scorecard still leaves the champion card unchanged. */
export async function recordResearchScorecard() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: "database_not_configured" as const, scorecard: null };
  await ensureResearchMemory();
  const rows = await sql<{
    session_date: Date | string;
    eligible: boolean;
    rank: number | null;
    expectancy_pct: string | null;
    room: boolean;
    blocks_room: boolean;
    gate_pass: boolean;
    forward_5_pct: string | null;
    realized_adverse: string | null;
  }[]>`
    SELECT d.session_date, d.eligible, d.rank, d.expectancy_pct, d.room, d.blocks_room, d.gate_pass,
           l.forward_5_pct, l.adverse_pct AS realized_adverse
    FROM research_decisions d
    LEFT JOIN research_labels l ON l.decision_id = d.id
    WHERE d.card_version = ${RESEARCH_CARD_VERSION}
  `;
  const scored: ScoredResearchRow[] = rows.map((row) => ({
    sessionDate: asDay(row.session_date),
    eligible: flag(row.eligible),
    rank: num(row.rank),
    expectancyPct: num(row.expectancy_pct),
    room: flag(row.room),
    blocksRoom: flag(row.blocks_room),
    gatePass: flag(row.gate_pass),
    forward5Pct: num(row.forward_5_pct),
    realizedAdversePct: num(row.realized_adverse),
  }));
  const scorecard: ResearchScorecard = scoreResearchBook(scored);
  const day = new Date().toISOString().slice(0, 10);
  await sql`
    INSERT INTO experiment_runs (
      id, model_key, model_version, experiment_type, status, regime, sample_size,
      metrics, leakage_checks, cost_assumptions, started_at, completed_at
    ) VALUES (
      ${`experiment:research-scorecard:${day}`},
      ${RESEARCH_CARD_KEY},
      ${RESEARCH_CARD_VERSION},
      'research-scorecard',
      ${scorecard.status},
      'all',
      ${scorecard.tenSlots},
      ${toJsonb(scorecard)}::jsonb,
      ${toJsonb({ teacher: scorecard.teacher, holdoutUsedForPromotion: false, liveEvidence: false })}::jsonb,
      ${toJsonb({ capitalExecutionEnabled: false, brokerAuthority: false })}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = excluded.status,
      sample_size = excluded.sample_size,
      metrics = excluded.metrics,
      leakage_checks = excluded.leakage_checks,
      cost_assumptions = excluded.cost_assumptions,
      completed_at = now()
  `;
  return { ok: true as const, scorecard, promoted: false as const, capitalExecutionEnabled: false as const };
}
