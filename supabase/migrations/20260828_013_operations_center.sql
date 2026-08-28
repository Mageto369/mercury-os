create table if not exists public.notification_rules (
  id text primary key,
  rule_key text not null unique,
  display_name text not null,
  category text not null,
  enabled boolean not null default true,
  minimum_severity text not null default 'high',
  channel text not null default 'dashboard',
  destination text,
  conditions jsonb not null default '{}'::jsonb,
  cooldown_minutes integer not null default 60 check (cooldown_minutes between 1 and 10080),
  shadow_only boolean not null default true check (shadow_only = true),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_rules enable row level security;
revoke all on table public.notification_rules from anon, authenticated;

insert into public.notification_rules(id,rule_key,display_name,category,enabled,minimum_severity,channel,conditions,shadow_only)
values
('notification:opportunity','opportunity_high_confidence','High-confidence opportunity','opportunity',true,'high','dashboard','{"minConfidence":80}'::jsonb,true),
('notification:filing','material_sec_filing','Material SEC filing','filing',true,'high','dashboard','{}'::jsonb,true),
('notification:risk','critical_risk_incident','Critical risk incident','risk',true,'critical','dashboard','{}'::jsonb,true),
('notification:pipeline','pipeline_failure','Pipeline failure','operations',true,'high','dashboard','{}'::jsonb,true),
('notification:model','model_drift','Model drift','model',true,'high','dashboard','{}'::jsonb,true),
('notification:paper','paper_trade_event','Paper trade event','paper',true,'high','dashboard','{}'::jsonb,true)
on conflict(rule_key) do nothing;
