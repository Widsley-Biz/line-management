/**
 * 本番コンテナ起動時のマイグレーション適用スクリプト。
 * drizzle-orm の migrator と互換の __drizzle_migrations 管理を、
 * standalone ビルドに含まれる better-sqlite3 だけで行う。
 *
 * - journal管理済みDB: 未適用分のみ適用（drizzle migrate と同じ判定）
 * - journal未管理の既存DB（tenantsテーブルあり）: 0007までをベースライン登録し、以降を適用
 * - 空DB: 全マイグレーションを適用
 *
 * 失敗してもプロセスは正常終了する（サーバー起動を妨げない）。エラーはログで確認する。
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";

// journal未管理の既存DBに対して「適用済み」とみなす最後のマイグレーションtag
const BASELINE_LAST_TAG = "0007_sf_no_action_reason";

// スキーマドリフト（journal記録なしで手動適用済み等）への耐性:
// 「既に存在する」系のエラーはスキップして続行する
const TOLERABLE_ERROR = /duplicate column name|already exists/i;

function main() {
  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL ?? "lime.db");
  const migrationsDir = path.resolve(process.cwd(), "drizzle/migrations");
  const journalPath = path.join(migrationsDir, "meta/_journal.json");

  if (!fs.existsSync(journalPath)) {
    console.error("[migrate] drizzle/migrations/meta/_journal.json が見つかりません。スキップします");
    return;
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);

  const db = new Database(dbPath);
  db.pragma("busy_timeout = 10000");
  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");

  try {
    db.exec(
      `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`
    );

    const hasTable = (name) =>
      !!db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(name);

    const journalCount = db
      .prepare(`SELECT COUNT(*) c FROM "__drizzle_migrations"`)
      .get().c;

    // journal未管理の既存DB → ベースライン登録（SQLは実行しない）
    if (journalCount === 0 && hasTable("tenants")) {
      console.log(`[migrate] 既存DBを検出。${BASELINE_LAST_TAG} までをベースライン登録します`);
      const insert = db.prepare(
        `INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)`
      );
      for (const entry of entries) {
        const sql = fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf-8");
        insert.run(createHash("sha256").update(sql).digest("hex"), entry.when);
        if (entry.tag === BASELINE_LAST_TAG) break;
      }
    }

    const lastApplied = db
      .prepare(`SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`)
      .get();
    const lastMillis = lastApplied ? Number(lastApplied.created_at) : -1;

    const insert = db.prepare(
      `INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)`
    );

    let applied = 0;
    for (const entry of entries) {
      if (entry.when <= lastMillis) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf-8");
      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      const run = db.transaction(() => {
        for (const stmt of statements) {
          try {
            db.exec(stmt);
          } catch (e) {
            if (TOLERABLE_ERROR.test(String(e && e.message))) {
              console.log(`[migrate] skip (既に適用済み): ${entry.tag} :: ${String(e.message)}`);
            } else {
              throw e;
            }
          }
        }
        insert.run(createHash("sha256").update(sql).digest("hex"), entry.when);
      });
      run();
      console.log(`[migrate] applied: ${entry.tag}`);
      applied++;
    }

    console.log(applied > 0 ? `[migrate] ${applied}件適用しました` : "[migrate] 適用済み（変更なし）");
  } catch (e) {
    console.error("[migrate] マイグレーション適用に失敗しました（サーバーは起動します）:", e);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (e) {
  console.error("[migrate] 予期しないエラー（サーバーは起動します）:", e);
}
