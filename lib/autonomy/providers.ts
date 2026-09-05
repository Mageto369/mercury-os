import { isDatabaseConfigured } from '@/lib/db/config';
import { getSql } from '@/lib/db';

export type ProviderKey =
  | 'database'
  | 'marketData'
  | 'sec'
  | 'otc'
  | 'reddit'
  | 'discord'
  | 'telegram'
  | 'facebook'
  | 'ai';

export interface ProviderState {
  configured: boolean;
  requiredForAutonomy: boolean;
}

export async function getProviderReadiness(): Promise<Record<ProviderKey, ProviderState>> {
  let marketConfigured = Boolean(process.env.MASSIVE_API_KEY || process.env.INTRINIO_API_KEY || process.env.MARKET_DATA_API_KEY);
  let aiConfigured = Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY);
  const sql = getSql();
  if (sql) {
    try {
      const rows = await sql<{ id: string; enabled: boolean; model: string | null; secret_configured: boolean }[]>`
        select c.id, c.enabled, c.model,
               exists(select 1 from integration_secrets s where s.integration_id=c.id and s.secret_name='api_key') as secret_configured
        from integration_configs c
        where c.id in ('massive','intrinio','openai','anthropic','gemini','deepseek','kimi')`;
      marketConfigured ||= rows.some((row) => ['massive', 'intrinio'].includes(row.id) && row.enabled && row.secret_configured);
      aiConfigured ||= rows.some((row) => ['openai', 'anthropic', 'gemini', 'deepseek', 'kimi'].includes(row.id) && row.enabled && Boolean(row.model) && row.secret_configured);
    } catch {
      // Environment configuration remains a valid fallback during bootstrap.
    }
  }
  return {
    database: { configured: isDatabaseConfigured(), requiredForAutonomy: true },
    marketData: { configured: marketConfigured, requiredForAutonomy: true },
    sec: { configured: true, requiredForAutonomy: false },
    otc: { configured: Boolean(process.env.OTC_MARKETS_API_KEY), requiredForAutonomy: false },
    reddit: { configured: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET), requiredForAutonomy: false },
    discord: { configured: Boolean(process.env.DISCORD_BOT_TOKEN), requiredForAutonomy: false },
    telegram: { configured: Boolean(process.env.TELEGRAM_BOT_TOKEN), requiredForAutonomy: false },
    facebook: { configured: Boolean(process.env.FACEBOOK_ACCESS_TOKEN), requiredForAutonomy: false },
    ai: { configured: aiConfigured, requiredForAutonomy: false },
  };
}

export async function configuredProviderKeys() {
  const readiness = await getProviderReadiness();
  return Object.entries(readiness)
    .filter(([, state]) => state.configured)
    .map(([key]) => key as ProviderKey);
}
