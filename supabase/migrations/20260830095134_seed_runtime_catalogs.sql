insert into public.integration_configs (
  id,
  category,
  provider,
  display_name,
  base_url,
  enabled,
  capabilities,
  settings,
  health_status
)
values
  ('massive', 'market', 'massive', 'Massive Market Data', null, false, '["quotes","snapshots","historical"]'::jsonb, '{}'::jsonb, 'unknown'),
  ('intrinio', 'market', 'intrinio', 'Intrinio', null, false, '["quotes","fundamentals"]'::jsonb, '{}'::jsonb, 'unknown'),
  ('sec-edgar', 'regulatory', 'sec-edgar', 'SEC EDGAR', 'https://data.sec.gov', true, '["filings","company-facts","form4"]'::jsonb, '{"builtInIdentity":true,"authoritative":true}'::jsonb, 'ready'),
  ('fred', 'macro', 'fred', 'FRED / ALFRED', 'https://api.stlouisfed.org', false, '["macro","vintages"]'::jsonb, '{}'::jsonb, 'unknown'),
  ('open-intelligence-sidecar', 'service', 'open-intelligence-sidecar', 'Open Intelligence Sidecar', null, false, '["edgar","reference","calendar","macro"]'::jsonb, '{}'::jsonb, 'unknown'),
  ('research-proof-sidecar', 'service', 'research-proof-sidecar', 'Research Proof Sidecar', null, false, '["vectorbt","quantstats","backtrader"]'::jsonb, '{}'::jsonb, 'unknown'),
  ('openai', 'llm', 'openai', 'OpenAI', null, false, '["reasoning","classification","summarization"]'::jsonb, '{}'::jsonb, 'unknown'),
  ('anthropic', 'llm', 'anthropic', 'Anthropic', null, false, '["reasoning","summarization"]'::jsonb, '{}'::jsonb, 'unknown'),
  ('gemini', 'llm', 'gemini', 'Google Gemini', null, false, '["reasoning","classification"]'::jsonb, '{}'::jsonb, 'unknown')
on conflict (id) do update set
  category = excluded.category,
  provider = excluded.provider,
  display_name = excluded.display_name,
  capabilities = excluded.capabilities,
  updated_at = now();
