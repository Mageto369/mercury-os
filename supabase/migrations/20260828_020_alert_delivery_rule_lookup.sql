create index if not exists alert_delivery_rule_status_time_idx
  on public.alert_deliveries ((payload ->> 'ruleKey'), status, created_at desc);
