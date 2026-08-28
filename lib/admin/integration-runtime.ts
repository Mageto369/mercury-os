import { getSql } from '@/lib/db';
import { resolveIntegrationSecret } from '@/lib/admin/vault';

export type RuntimeIntegration = {
  id: string;
  enabled: boolean;
  baseUrl: string | null;
  model: string | null;
  settings: Record<string, unknown>;
};

export async function getRuntimeIntegration(id: string): Promise<RuntimeIntegration | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql<any[]>`select id,enabled,base_url,model,settings from integration_configs where id=${id} limit 1`;
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: String(row.id),
    enabled: Boolean(row.enabled),
    baseUrl: row.base_url ? String(row.base_url) : null,
    model: row.model ? String(row.model) : null,
    settings: row.settings && typeof row.settings === 'object' ? row.settings as Record<string, unknown> : {},
  };
}

export async function resolveIntegrationBaseUrl(id: string, envNames: string[]) {
  for (const envName of envNames) {
    const value = process.env[envName];
    if (value) return value;
  }
  const config = await getRuntimeIntegration(id);
  if (!config?.enabled) return null;
  return config.baseUrl;
}

export async function resolveIntegrationToken(id: string, envNames: string[], secretName: string) {
  const config = await getRuntimeIntegration(id);
  if (config && !config.enabled) return null;
  return resolveIntegrationSecret(id, envNames, secretName);
}
