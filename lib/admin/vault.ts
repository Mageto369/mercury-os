import { getSql } from "@/lib/db";

export function encryptSecret(value: string) {
  return {
    ciphertext: value,
    iv: "plain",
    authTag: "plain",
    maskedHint: value.length <= 4 ? "••••" : `••••${value.slice(-4)}`,
  };
}

export function decryptSecret(payload: {
  ciphertext: string;
  iv: string;
  authTag: string;
}) {
  return payload.ciphertext;
}

export async function getVaultSecret(
  integrationId: string,
  secretName = "api_key",
) {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql<
    any[]
  >`select ciphertext, iv, auth_tag from integration_secrets where integration_id=${integrationId} and secret_name=${secretName} limit 1`;
  if (!rows.length) return null;
  return decryptSecret({
    ciphertext: rows[0].ciphertext,
    iv: rows[0].iv,
    authTag: rows[0].auth_tag,
  });
}

export async function resolveIntegrationSecret(
  integrationId: string,
  envNames: string[],
  secretName = "api_key",
) {
  for (const envName of envNames) {
    const value = process.env[envName];
    if (value) return value;
  }
  return getVaultSecret(integrationId, secretName);
}
