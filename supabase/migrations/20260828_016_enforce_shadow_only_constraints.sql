alter table public.alert_deliveries
  drop constraint if exists alert_deliveries_shadow_only_check;
alter table public.alert_deliveries
  add constraint alert_deliveries_shadow_only_check check (shadow_only = true);

alter table public.autonomous_actions
  drop constraint if exists autonomous_actions_shadow_only_check;
alter table public.autonomous_actions
  add constraint autonomous_actions_shadow_only_check check (shadow_only = true);

alter table public.backfill_runs
  drop constraint if exists backfill_runs_shadow_only_check;
alter table public.backfill_runs
  add constraint backfill_runs_shadow_only_check check (shadow_only = true);

alter table public.model_ensemble_scores
  drop constraint if exists model_ensemble_scores_shadow_only_check;
alter table public.model_ensemble_scores
  add constraint model_ensemble_scores_shadow_only_check check (shadow_only = true);

alter table public.portfolio_decisions
  drop constraint if exists portfolio_decisions_shadow_only_check;
alter table public.portfolio_decisions
  add constraint portfolio_decisions_shadow_only_check check (shadow_only = true);

alter table public.proof_metrics
  drop constraint if exists proof_metrics_shadow_only_check;
alter table public.proof_metrics
  add constraint proof_metrics_shadow_only_check check (shadow_only = true);

alter table public.research_experiments
  drop constraint if exists research_experiments_shadow_only_check;
alter table public.research_experiments
  add constraint research_experiments_shadow_only_check check (shadow_only = true);
