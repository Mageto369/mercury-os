import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const opportunityState = pgEnum("opportunity_state", [
  "DORMANT",
  "ACCUMULATION",
  "IGNITION",
  "BREAKOUT",
  "ACCELERATION",
  "EUPHORIA",
  "EXHAUSTION",
  "DISTRIBUTION",
]);

export const securities = pgTable("securities", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name"),
  market: text("market").notNull(),
  cik: text("cik"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const marketSnapshots = pgTable("market_snapshots", {
  id: text("id").primaryKey(),
  securityId: text("security_id").notNull().references(() => securities.id),
  price: numeric("price", { precision: 18, scale: 8 }).notNull(),
  volume: numeric("volume", { precision: 20, scale: 0 }),
  dollarVolume: numeric("dollar_volume", { precision: 20, scale: 2 }),
  bid: numeric("bid", { precision: 18, scale: 8 }),
  ask: numeric("ask", { precision: 18, scale: 8 }),
  spreadBps: integer("spread_bps"),
  rvol: numeric("rvol", { precision: 10, scale: 3 }),
  floatRotation: numeric("float_rotation", { precision: 10, scale: 3 }),
  payload: jsonb("payload"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
}, (table) => [index("market_security_time_idx").on(table.securityId, table.observedAt)]);

export const socialMentions = pgTable("social_mentions", {
  id: text("id").primaryKey(),
  securityId: text("security_id").notNull().references(() => securities.id),
  source: text("source").notNull(),
  sourceRef: text("source_ref"),
  authorRef: text("author_ref"),
  sentiment: integer("sentiment"),
  promotionRisk: integer("promotion_risk"),
  engagement: integer("engagement"),
  payload: jsonb("payload"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
}, (table) => [index("social_security_time_idx").on(table.securityId, table.observedAt)]);

export const filings = pgTable("filings", {
  id: text("id").primaryKey(),
  securityId: text("security_id").notNull().references(() => securities.id),
  accessionNumber: text("accession_number").notNull().unique(),
  form: text("form").notNull(),
  filedAt: timestamp("filed_at", { withTimezone: true }).notNull(),
  url: text("url"),
  parsed: jsonb("parsed"),
});

export const shareStructures = pgTable("share_structures", {
  id: text("id").primaryKey(),
  securityId: text("security_id").notNull().references(() => securities.id),
  authorizedShares: numeric("authorized_shares", { precision: 22, scale: 0 }),
  outstandingShares: numeric("outstanding_shares", { precision: 22, scale: 0 }),
  floatShares: numeric("float_shares", { precision: 22, scale: 0 }),
  verified: boolean("verified").default(false),
  source: text("source"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
}, (table) => [index("share_structure_security_time_idx").on(table.securityId, table.observedAt)]);

export const corporateActions = pgTable("corporate_actions", {
  id: text("id").primaryKey(),
  securityId: text("security_id").notNull().references(() => securities.id),
  type: text("type").notNull(),
  effectiveDate: timestamp("effective_date", { withTimezone: true }),
  riskScore: integer("risk_score").notNull().default(0),
  payload: jsonb("payload"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
});

export const opportunities = pgTable("opportunities", {
  id: text("id").primaryKey(),
  securityId: text("security_id").notNull().references(() => securities.id),
  state: opportunityState("state").notNull(),
  alpha: integer("alpha").notNull(),
  gem: integer("gem").notNull(),
  wave: integer("wave").notNull(),
  asymmetry: integer("asymmetry").notNull(),
  catalyst: integer("catalyst").notNull(),
  social: integer("social").notNull(),
  liquidity: integer("liquidity").notNull(),
  trapRisk: integer("trap_risk").notNull(),
  peakRisk: integer("peak_risk").notNull(),
  confidence: integer("confidence").notNull(),
  aggression: integer("aggression").notNull(),
  action: text("action").notNull(),
  hardBlocked: boolean("hard_blocked").notNull().default(false),
  reasons: jsonb("reasons").notNull(),
  modelVersion: text("model_version").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
}, (table) => [index("opportunity_security_time_idx").on(table.securityId, table.observedAt)]);

export const workflowRuns = pgTable("workflow_runs", {
  id: text("id").primaryKey(),
  workflow: text("workflow").notNull(),
  status: text("status").notNull(),
  trigger: text("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  stats: jsonb("stats"),
  error: text("error"),
});

export const decisionLogs = pgTable("decision_logs", {
  id: text("id").primaryKey(),
  securityId: text("security_id").references(() => securities.id),
  opportunityId: text("opportunity_id").references(() => opportunities.id),
  decision: text("decision").notNull(),
  actor: text("actor").notNull(),
  modelVersion: text("model_version"),
  inputs: jsonb("inputs"),
  rationale: jsonb("rationale"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const autonomousActions = pgTable("autonomous_actions", {
  id: text("id").primaryKey(),
  workflowRunId: text("workflow_run_id").references(() => workflowRuns.id),
  job: text("job").notNull(),
  actionType: text("action_type").notNull(),
  status: text("status").notNull(),
  shadowOnly: boolean("shadow_only").notNull().default(true),
  providerRequirements: jsonb("provider_requirements").notNull(),
  providerState: jsonb("provider_state").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("autonomous_action_job_time_idx").on(table.job, table.createdAt)]);

export const systemEvents = pgTable("system_events", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  source: text("source").notNull(),
  message: text("message").notNull(),
  payload: jsonb("payload"),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("system_event_category_time_idx").on(table.category, table.observedAt)]);
