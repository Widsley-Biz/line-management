import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { conciergeSyncRuns } from "@/lib/db/schema";
import { createRun, finishRun } from "@/lib/concierge/runs";
import { triggerConciergeJob } from "@/lib/concierge/job";
import { requireRole } from "@/lib/api-auth";
import { logActivity } from "@/lib/audit";

/**
 * POST /api/concierge/sync — コンシェルからの日次取得を起動する。
 *
 * 呼び出し元は2つ。
 *  - Cloud Scheduler: x-scheduler-token ヘッダで認証
 *  - 画面の「更新」ボタン: ログイン中の admin / leader
 *
 * INV-3 により、実行履歴は Job を起動する「前」に作る。
 * 起動に失敗した場合もその行を failed で閉じるので、記録が消えることはない。
 */

/** 二重起動の抑止。これより新しい queued/running があれば起動しない */
const STALE_MS = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  const schedulerToken = process.env.SCHEDULER_TOKEN;
  const presented = req.headers.get("x-scheduler-token");
  const fromScheduler =
    !!schedulerToken && !!presented && presented === schedulerToken;

  let userId: string | null = null;

  if (!fromScheduler) {
    const guard = await requireRole(["admin", "leader"]);
    if (!guard.ok) return guard.response;
    userId = guard.session.user.id;
  }

  // すでに動いているものがあれば重ねない
  const [open] = await db
    .select({
      id: conciergeSyncRuns.id,
      queuedAt: conciergeSyncRuns.queuedAt,
      heartbeatAt: conciergeSyncRuns.heartbeatAt,
    })
    .from(conciergeSyncRuns)
    .where(
      and(
        inArray(conciergeSyncRuns.status, ["queued", "running"]),
        eq(conciergeSyncRuns.runType, "read")
      )
    )
    .orderBy(desc(conciergeSyncRuns.queuedAt))
    .limit(1);

  if (open) {
    const last = new Date(open.heartbeatAt ?? open.queuedAt).getTime();
    if (Date.now() - last < STALE_MS) {
      return NextResponse.json(
        { error: "同期がすでに実行中です。完了までお待ちください", runId: open.id },
        { status: 409 }
      );
    }
    // 音沙汰がないものは timeout で閉じてから新しく起こす
    await finishRun(open.id, {
      status: "timeout",
      errorMessage: "30分以上応答がなかったため打ち切りました",
    });
  }

  const run = await createRun({
    runType: "read",
    trigger: fromScheduler ? "schedule" : "manual",
    triggeredByUserId: userId,
  });

  const base =
    process.env.APP_BASE_URL?.replace(/\/$/, "") ??
    req.nextUrl.origin.replace(/\/$/, "");

  const result = await triggerConciergeJob({
    runId: run.id,
    callbackToken: run.callbackToken,
    callbackUrl: `${base}/api/concierge/observed`,
  });

  if (!result.ok) {
    // ローカル開発では Cloud Run Job を起動できない。
    // 実行履歴は queued のまま残し、ボットを手で流して続きを確認できるようにする。
    if (process.env.NODE_ENV !== "production") {
      console.log(
        [
          "",
          "── concierge-bot をローカルで流す ──",
          "cd jobs/concierge-bot && \\",
          `  RUN_ID=${run.id} \\`,
          `  CALLBACK_TOKEN=${run.callbackToken} \\`,
          `  CALLBACK_URL=${base}/api/concierge/observed \\`,
          "  SB_CONCIERGE_LOGIN_URL=http://localhost:3000/mock-concierge/login \\",
          "  SB_CONCIERGE_ID=test SB_CONCIERGE_PASSWORD=test node index.mjs",
          "",
        ].join("\n")
      );
      return NextResponse.json({
        ok: true,
        runId: run.id,
        note: "Job を起動できないため queued のままにしました（サーバーログの手順で手動実行してください）",
      });
    }

    await finishRun(run.id, { status: "failed", errorMessage: result.error });
    return NextResponse.json(
      { error: `同期を開始できませんでした: ${result.error}`, runId: run.id },
      { status: 502 }
    );
  }

  await db
    .update(conciergeSyncRuns)
    .set({ executionName: result.executionName, updatedAt: new Date().toISOString() })
    .where(eq(conciergeSyncRuns.id, run.id));

  await logActivity({
    userId,
    actionType: "concierge_sync_start",
    message: fromScheduler
      ? "コンシェル同期を開始しました（自動実行）"
      : "コンシェル同期を開始しました（手動実行）",
    targetTable: "concierge_sync_runs",
    targetId: run.id,
  });

  return NextResponse.json({ ok: true, runId: run.id });
}
