import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as coreSchema from "@/lib/db/schema";
import * as opsSchema from "@/lib/db/ops-schema";

const schema = { ...coreSchema, ...opsSchema };

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

export function getDb() {
  const sql = getSql();
  if (!sql) return null;
  return drizzle(sql, { schema });
}
