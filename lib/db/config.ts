const DATABASE_URL_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "SUPABASE_DB_URL",
] as const;

export type DatabaseUrlKey = (typeof DATABASE_URL_KEYS)[number];
type Environment = Record<string, string | undefined>;

export function getDatabaseConfig(env: Environment = process.env): {
  url: string | null;
  source: DatabaseUrlKey | null;
} {
  for (const key of DATABASE_URL_KEYS) {
    const value = env[key]?.trim();
    if (value) return { url: value, source: key };
  }

  return { url: null, source: null };
}

export function isDatabaseConfigured(env: Environment = process.env) {
  return getDatabaseConfig(env).url !== null;
}
