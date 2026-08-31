import { expect, test } from '@playwright/test';
import { getDatabaseConfig, isDatabaseConfigured } from '../../lib/db/config';

test('database configuration prefers the Mercury key', () => {
  const config = getDatabaseConfig({
    DATABASE_URL: ' postgres://primary ',
    POSTGRES_URL: 'postgres://vercel',
  });

  expect(config).toEqual({ url: 'postgres://primary', source: 'DATABASE_URL' });
});

test('database configuration accepts Vercel integration keys', () => {
  expect(getDatabaseConfig({ POSTGRES_URL: 'postgres://vercel' })).toEqual({
    url: 'postgres://vercel',
    source: 'POSTGRES_URL',
  });
  expect(getDatabaseConfig({ POSTGRES_PRISMA_URL: 'postgres://prisma' })).toEqual({
    url: 'postgres://prisma',
    source: 'POSTGRES_PRISMA_URL',
  });
  expect(getDatabaseConfig({ SUPABASE_DB_URL: 'postgres://supabase' })).toEqual({
    url: 'postgres://supabase',
    source: 'SUPABASE_DB_URL',
  });
});

test('database configuration rejects blank values', () => {
  expect(getDatabaseConfig({ DATABASE_URL: '  ', POSTGRES_URL: '' })).toEqual({
    url: null,
    source: null,
  });
  expect(isDatabaseConfigured({})).toBe(false);
});
