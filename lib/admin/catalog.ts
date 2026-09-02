export const integrationCatalog = [
  { id:'massive', category:'market', provider:'massive', displayName:'Massive Market Data', capabilities:['quotes','snapshots','historical'], secretName:'api_key' },
  { id:'intrinio', category:'market', provider:'intrinio', displayName:'Intrinio', capabilities:['quotes','fundamentals'], secretName:'api_key' },
  { id:'sec-edgar', category:'regulatory', provider:'sec-edgar', displayName:'SEC EDGAR', capabilities:['filings','company-facts','form4'], secretName:'identity' },
  { id:'fred', category:'macro', provider:'fred', displayName:'FRED / ALFRED', capabilities:['macro','vintages'], secretName:'api_key' },
  { id:'open-intelligence-sidecar', category:'service', provider:'open-intelligence-sidecar', displayName:'Open Intelligence Sidecar', capabilities:['edgar','reference','calendar','macro'], secretName:'service_token' },
  { id:'research-proof-sidecar', category:'service', provider:'research-proof-sidecar', displayName:'Research Proof Sidecar', capabilities:['vectorbt','quantstats','backtrader'], secretName:'service_token' },
  { id:'openai', category:'llm', provider:'openai', displayName:'OpenAI', capabilities:['reasoning','classification','summarization'], secretName:'api_key' },
  { id:'anthropic', category:'llm', provider:'anthropic', displayName:'Anthropic', capabilities:['reasoning','summarization'], secretName:'api_key' },
  { id:'gemini', category:'llm', provider:'gemini', displayName:'Google Gemini', capabilities:['reasoning','classification'], secretName:'api_key' },
  { id:'deepseek', category:'llm', provider:'deepseek', displayName:'DeepSeek', capabilities:['reasoning','classification','summarization'], secretName:'api_key', defaultBaseUrl:'https://api.deepseek.com', defaultModel:'deepseek-v4-pro' },
  { id:'kimi', category:'llm', provider:'kimi', displayName:'Kimi K2 (Moonshot AI)', capabilities:['reasoning','classification','summarization'], secretName:'api_key', defaultBaseUrl:'https://api.moonshot.ai/v1', defaultModel:'kimi-k2.6' },
] as const;

export const ingestionCatalog = [
  { key:'market-snapshots', displayName:'Market Snapshots', cadenceMinutes:1, batchSize:100 },
  { key:'sec-filings', displayName:'SEC Filings', cadenceMinutes:5, batchSize:100 },
  { key:'share-structure', displayName:'Share Structure', cadenceMinutes:60, batchSize:100 },
  { key:'corporate-actions', displayName:'Corporate Actions', cadenceMinutes:30, batchSize:100 },
  { key:'social-radar', displayName:'Authorized Social Radar', cadenceMinutes:5, batchSize:250 },
  { key:'macro-series', displayName:'Macro Series', cadenceMinutes:60, batchSize:50 },
  { key:'research-proof', displayName:'Research Proof Cycle', cadenceMinutes:360, batchSize:50 },
] as const;
