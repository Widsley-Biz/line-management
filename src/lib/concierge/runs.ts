import "server-only";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conciergeSyncRuns } from "@/lib/db/schema";

/**
 * 同期の実行履歴。
 *
 * PERF-02（60MB級CDRの取込がOOMで落ち、履歴に何も残らず請求欠落に気づけなかった）
 * の再発防止として、行は「処理を始める前」に作る。途中で落ちても記録が残る。
 */

export type RunType = "probe" | "read" | "write" | "billing_csv";
export type RunTrigger = "schedule" | "manual" | "import";
export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "timeout";

export type LogEntry = { at: string; step: string; level: string; message: string };

/** 実行履歴を queued で作り、runId と使い捨てコールバックトークンを返す */
export async function createRun(params: {
  runType: RunType;
  trigger: RunTrigger;
  triggeredByUserId?: string | null;
}): Promise<{ id: string; callbackToken: string }> {
  const id = randomUUID();
  const callbackToken = randomUUID();
  const now = new Date().toISOString();

  await db.insert(conciergeSyncRuns).values({
    id,
    runType: params.runType,
    trigger: params.trigger,
    triggeredByUserId: params.triggeredByUserId ?? null,
    status: "queued",
    queuedAt: now,
    callbackToken,
    createdAt: now,
    updatedAt: now,
  });

  return { id, callbackToken };
}

export async function markRunning(runId: string, step?: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(conciergeSyncRuns)
    .set({
      status: "running",
      startedAt: now,
      heartbeatAt: now,
      currentStep: step ?? null,
      updatedAt: now,
    })
    .where(eq(conciergeSyncRuns.id, runId));
}

/** 実行を終端にする。成功・失敗のどちらでも必ず呼ぶこと */
export async function finishRun(
  runId: string,
  params: {
    status: Exclude<RunStatus, "queued" | "running">;
    linesSeen?: number;
    diffsCreated?: number;
    writesAttempted?: number;
    writesSucceeded?: number;
    errorMessage?: string | null;
    log?: LogEntry[];
  }
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(conciergeSyncRuns)
    .set({
      status: params.status,
      finishedAt: now,
      linesSeen: params.linesSeen ?? 0,
      diffsCreated: params.diffsCreated ?? 0,
      writesAttempted: params.writesAttempted ?? 0,
      writesSucceeded: params.writesSucceeded ?? 0,
      errorMessage: params.errorMessage ?? null,
      // ログは肥大化させない。GCSマウント上のSQLiteに毎日積む前提なので上限を切る
      logJson: JSON.stringify((params.log ?? []).slice(-200)),
      updatedAt: now,
    })
    .where(eq(conciergeSyncRuns.id, runId));
}
