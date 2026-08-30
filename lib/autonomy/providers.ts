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

export function getProviderReadiness(): Record<ProviderKey, ProviderState> {
  const marketConfigured = Boolean(process.env.MASSIVE_API_KEY || process.env.INTRINIO_API_KEY || process.env.MARKET_DATA_API_KEY);
  return {
    database: { configured: Boolean(process.env.DATABASE_URL), requiredForAutonomy: true },
    marketData: { configured: marketConfigured, requiredForAutonomy: true },
    sec: { configured: true, requiredForAutonomy: false },
    otc: { configured: Boolean(process.env.OTC_MARKETS_API_KEY), requiredForAutonomy: false },
    reddit: { configured: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET), requiredForAutonomy: false },
    discord: { configured: Boolean(process.env.DISCORD_BOT_TOKEN), requiredForAutonomy: false },
    telegram: { configured: Boolean(process.env.TELEGRAM_BOT_TOKEN), requiredForAutonomy: false },
    facebook: { configured: Boolean(process.env.FACEBOOK_ACCESS_TOKEN), requiredForAutonomy: false },
    ai: { configured: Boolean(process.env.OPENAI_API_KEY), requiredForAutonomy: false },
  };
}

export function configuredProviderKeys() {
  const readiness = getProviderReadiness();
  return Object.entries(readiness)
    .filter(([, state]) => state.configured)
    .map(([key]) => key as ProviderKey);
}
