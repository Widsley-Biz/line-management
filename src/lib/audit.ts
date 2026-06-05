import "server-only";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
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
    // userId 未指定時はログイン中ユーザーを自動で記録
    let userId = params.userId ?? null;
    if (userId === null && params.userId === undefined) {
      const session = await auth().catch(() => null);
      userId = session?.user?.id ?? null;
    }
    // 日本時間で保存
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .replace("Z", "+09:00");

    await db.insert(auditLogs).values({
      id: randomUUID(),
      userId,
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