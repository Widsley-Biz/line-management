import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * 直列化用のキュー。
 * better-sqlite3 は同期APIだが、トランザクション内の `await` でイベントループに
 * 制御が戻るため、別リクエストが同じ接続で BEGIN を発行し
 * 「cannot start a transaction within a transaction」になりうる。
 * トランザクションを1つずつ順番に実行することで防ぐ。
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * 一連の書き込みを1つのトランザクションにまとめて実行する。
 *
 * 本番DBはGCSをマウントしたSQLiteファイルで、コミットごとにネットワーク越しの
 * 同期が発生する。書き込みを個別にコミットすると数百回の同期が積み上がり、
 * Cloud Runのリクエストタイムアウト（既定300秒）を超えて取込が完走しない。
 * まとめてコミットすることで同期を1回に減らす。
 *
 * drizzle(better-sqlite3)の `transaction()` は同期コールバック前提で既存の
 * async 処理をそのまま渡せないため、BEGIN/COMMIT をSQLで発行している。
 *
 * 注意: トランザクションは入れ子にできない。この関数のコールバック内で
 * 再度この関数を呼ばないこと。
 */
export function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    await db.run(sql`BEGIN IMMEDIATE`);
    try {
      const value = await fn();
      await db.run(sql`COMMIT`);
      return value;
    } catch (error) {
      try {
        await db.run(sql`ROLLBACK`);
      } catch {
        // 既にロールバック済み・接続断などは握りつぶす（元のエラーを投げたい）
      }
      throw error;
    }
  });
  // 失敗しても後続のトランザクションは実行したいのでキューはリセットする
  queue = result.catch(() => undefined);
  return result;
}
