import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const agentHeartbeats = pgTable('agent_heartbeats', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  status: text('status').notNull(),
  mode: text('mode').notNull().default('shadow'),
  currentMission: text('current_mission'),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  details: jsonb('details'),
  observedAt: timestamp('observed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('agent_heartbeat_agent_time_idx').on(table.agentId, table.observedAt)]);

export const alertDeliveries = pgTable('alert_deliveries', {
  id: text('id').primaryKey(),
  eventKey: text('event_key'),
  severity: text('severity').notNull(),
  channel: text('channel').notNull(),
  destination: text('destination'),
  status: text('status').notNull(),
  shadowOnly: boolean('shadow_only').notNull().default(true),
  attempts: integer('attempts').notNull().default(0),
  payload: jsonb('payload'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, (table) => [index('alert_delivery_status_time_idx').on(table.status, table.createdAt)]);

export const replayRuns = pgTable('replay_runs', {
  id: text('id').primaryKey(),
  modelVersion: text('model_version').notNull(),
  status: text('status').notNull(),
  lookbackDays: integer('lookback_days').notNull(),
  opportunitiesReviewed: integer('opportunities_reviewed').notNull().default(0),
  decisionsReviewed: integer('decisions_reviewed').notNull().default(0),
  driftDetected: boolean('drift_detected').notNull().default(false),
  metrics: jsonb('metrics'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [index('replay_run_time_idx').on(table.startedAt)]);
