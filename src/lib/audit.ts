import "server-only";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { randomUUID } from "crypto";

export async function logActivity(params: {
  userId?: string | null;
  actionType: string;
  message: string;
  targetTable?: string;
  targetId?: string;
  afterJson?: object;
}) {
  try {
    // 日本時間で保存
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .replace("Z", "+09:00");

    await db.insert(auditLogs).values({
      id: randomUUID(),
      userId: params.userId ?? null,
      actionType: params.actionType,
      message: params.message,
      targetTable: params.targetTable ?? null,
      targetId: params.targetId ?? null,
      beforeJson: null,
      afterJson: params.afterJson ? JSON.stringify(params.afterJson) : null,
      createdAt: jstNow,
    });
  } catch {
    // ログ失敗でメイン処理を止めない
  }
}