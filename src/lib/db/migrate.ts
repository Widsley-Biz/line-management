import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL ?? "lime.db");
const sqlite = new Database(dbPath);
sqlite.pragma("busy_timeout = 10000");
sqlite.pragma("journal_mode = DELETE"); // アプリ本体と同じモードに揃える（WALだとロック競合する）
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle/migrations" });
console.log("✅ Migration complete");
sqlite.close();
