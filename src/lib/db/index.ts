import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;
let _db: DrizzleDb | null = null;
function getDb(): DrizzleDb {
  if (_db) return _db;
  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL ?? "lime.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = DELETE");
  sqlite.pragma("foreign_keys = ON");
  _db = drizzle(sqlite, { schema });
  return _db;
}
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
export type DB = typeof db;
