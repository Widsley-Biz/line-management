/**
 * seed.ts — 初期データ投入
 * npx tsx src/lib/db/seed.ts で実行
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { users, ipTariffs } from "./schema";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import path from "path";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL ?? "lime.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

// Run migrations first
migrate(db, { migrationsFolder: "./drizzle/migrations" });

async function seed() {
  console.log("🌱 Seeding database...");

  // ============================================================
  // Users（初期アカウント）
  // ============================================================
  const initialUsers = [
    { email: "ryuji.kawakami@widsley.com",    name: "川上 隆司",   role: "admin"  as const },
    { email: "hirotaka.takahashi@widsley.com", name: "髙橋 弘孝",  role: "admin"  as const },
    { email: "hitomi.nishimura@widsley.com",  name: "西村 仁美",   role: "leader" as const },
    { email: "kazuya.yamaguchi@widsley.com",  name: "山口 和也",   role: "leader" as const },
    { email: "paruko.asai@widsley.com",       name: "浅井 巴留子", role: "member" as const },
    { email: "ryota.mori@widsley.com",        name: "森 諒太",     role: "member" as const },
    { email: "haruka.kagoshima@widsley.com",  name: "駕籠島 晴香", role: "member" as const },
  ];

  // 初回パスワード: "Widsley2024!" — 初回ログイン後に変更を促す
  const defaultPassword = "Widsley2024!";
  const hash = await bcrypt.hash(defaultPassword, 12);

  for (const u of initialUsers) {
    await db
      .insert(users)
      .values({ id: randomUUID(), ...u, passwordHash: hash })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${initialUsers.length} users created`);

  // ============================================================
  // IP Tariffs（デフォルトタリフ）
  // ============================================================
  await db
    .insert(ipTariffs)
    .values({
      id: "default",
      tenantId: null,
      fixedRate: 0.06,
      mobileRate: 0.25,
      naviSecRate: 1.2,
      naviAmountRate: 10.5,
    })
    .onConflictDoNothing();
  console.log("  ✓ default IP tariff created (0.06 / 0.25 / 1.2 / 10.5)");

  console.log("\n✅ Seed complete");
  console.log(`\n📋 Initial password for all users: "${defaultPassword}"`);
  console.log("   Please ask users to change their password on first login.\n");
}

seed().catch(console.error).finally(() => sqlite.close());
