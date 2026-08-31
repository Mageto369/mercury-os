import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as coreSchema from "@/lib/db/schema";
import * as opsSchema from "@/lib/db/ops-schema";
import { getDatabaseConfig } from "@/lib/db/config";

const schema = { ...coreSchema, ...opsSchema };
let sqlClient: ReturnType<typeof postgres> | null = null;

export function getSql() {
  const { url } = getDatabaseConfig();
  if (!url) return null;
  if (!sqlClient) {
    sqlClient = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT_SECONDS ?? 20),
      connect_timeout: Number(process.env.DATABASE_CONNECT_TIMEOUT_SECONDS ?? 10),
      prepare: false,
      ssl: 'require',
    });
  }
  return sqlClient;
}

export function getDb() {
  const sql = getSql();
  if (!sql) return null;
  return drizzle(sql, { schema });
}
