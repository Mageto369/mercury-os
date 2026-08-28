import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getSql } from '@/lib/db';

function vaultKey() {
  const raw = process.env.MERCURY_VAULT_KEY;
  if (!raw || raw.length < 24) return null;
  return createHash('sha256').update(raw).digest();
}

export function vaultConfigured() {
  return Boolean(vaultKey());
}

export function encryptSecret(value: string) {
  const key = vaultKey();
  if (!key) throw new Error('vault_not_configured');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: tag.toString('base64'),
    maskedHint: value.length <= 4 ? '••••' : `••••${value.slice(-4)}`,
  };
}

export function decryptSecret(payload: { ciphertext: string; iv: string; authTag: string }) {
  const key = vaultKey();
  if (!key) throw new Error('vault_not_configured');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export async function getVaultSecret(integrationId: string, secretName = 'api_key') {
  const sql = getSql();
  if (!sql || !vaultConfigured()) return null;
  const rows = await sql<any[]>`select ciphertext, iv, auth_tag from integration_secrets where integration_id=${integrationId} and secret_name=${secretName} limit 1`;
  if (!rows.length) return null;
  return decryptSecret({ ciphertext: rows[0].ciphertext, iv: rows[0].iv, authTag: rows[0].auth_tag });
}

export async function resolveIntegrationSecret(integrationId: string, envNames: string[], secretName = 'api_key') {
  for (const envName of envNames) {
    const value = process.env[envName];
    if (value) return value;
  }
  return getVaultSecret(integrationId, secretName);
}
