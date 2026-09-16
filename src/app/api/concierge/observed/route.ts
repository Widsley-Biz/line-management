import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conciergeSyncRuns } from "@/lib/db/schema";
import { finishRun, markRunning, type LogEntry } from "@/lib/concierge/runs";
import { ingestObservedLines } from "@/lib/concierge/ingest";
import { parseObservedRows, type ObservedRowInput } from "@/lib/concierge/observed-payload";
import { notify } from "@/lib/notify";
import { DIFF_TYPE_LABELS } from "@/lib/concierge/labels";

/**
 * POST /api/concierge/observed — concierge-bot からの取得結果を受け取る。
 *
 * INV-1（DBに書くのは本体サービスだけ）を守るための受け口。ボットは
 * スクレイピングしかせず、差分計算とDB書き込みはここで行う。
 *
 * 認証は run ごとの使い捨てトークン。ログインセッションは使わない
 * （Job はユーザーではないため）。
 */

type Body = {
  runId?: string;
  callbackToken?: string;
  /** 取得できた回線。全件一覧である前提 */
  rows?: ObservedRowInput[];
  /** ボット側で起きたことの記録。実行履歴に残す */
  log?: LogEntry[];
  /** ボットが途中で失敗した場合はこちらだけ送る */
  error?: string;
  /** 全件を取り切れたか。false なら解約判定を行わない */
  complete?: boolean;
};

/** 1回の取得で受け付ける上限。想定は3,600件前後 */
const MAX_ROWS = 20000;

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSONを解釈できません" }, { status: 400 });
  }

  const { runId, callbackToken, rows, log, error, complete } = body;

  if (!runId || !callbackToken) {
    return NextResponse.json(
      { error: "runId と callbackToken が必要です" },
      { status: 400 }
    );
  }

  const [run] = await db
    .select({
      id: conciergeSyncRuns.id,
      status: conciergeSyncRuns.status,
      callbackToken: conciergeSyncRuns.callbackToken,
    })
    .from(conciergeSyncRuns)
    .where(eq(conciergeSyncRuns.id, runId));

  if (!run || run.callbackToken !== callbackToken) {
    // 存在しない run と トークン不一致 を区別しない（総当たりの手掛かりを与えない）
    return NextResponse.json({ error: "認証できません" }, { status: 401 });
  }

  if (run.status !== "queued" && run.status !== "running") {
    return NextResponse.json(
      { error: "この実行はすでに終了しています" },
      { status: 409 }
    );
  }

  // ── ボットが失敗を報告してきた場合 ──
  if (error) {
    await finishRun(runId, { status: "failed", errorMessage: error, log });
    await notify({
      level: "error",
      category: "concierge_sync",
      title: "コンシェル同期に失敗しました",
      body: error,
      linkUrl: "/mobile/concierge",
      refTable: "concierge_sync_runs",
      refId: runId,
    });
    return NextResponse.json({ ok: true });
  }

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows が配列ではありません" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    await finishRun(runId, {
      status: "failed",
      errorMessage: `取得件数が上限を超えました（${rows.length}件）`,
      log,
    });
    return NextResponse.json({ error: "取得件数が多すぎます" }, { status: 413 });
  }

  await markRunning(runId, "取り込み中");

  try {
    const { lines, skipped } = parseObservedRows(rows);

    // 0件は「サイト改修でロケーターが外れた」可能性が高い。
    // そのまま detectRemovals すると全回線が解約提案になるので必ず止める。
    if (lines.length === 0) {
      const msg =
        "取得できた回線が0件でした。画面の改修でロケーターが外れた可能性があります";
      await finishRun(runId, { status: "failed", errorMessage: msg, log });
      await notify({
        level: "error",
        category: "concierge_sync",
        title: "コンシェル同期に失敗しました",
        body: msg,
        linkUrl: "/mobile/concierge",
        refTable: "concierge_sync_runs",
        refId: runId,
      });
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    // 全件取り切れていないときは解約判定をしない。
    // 「見えなかっただけ」を解約として提案してしまうため。
    const detectRemovals = complete === true;

    const summary = await ingestObservedLines({
      runId,
      source: "concierge",
      sourceRef: runId,
      observedAt: new Date().toISOString(),
      lines,
      detectRemovals,
    });

    const partial = skipped > 0 || !detectRemovals;

    await finishRun(runId, {
      status: partial ? "partial" : "succeeded",
      linesSeen: summary.linesSeen,
      diffsCreated: summary.diffsCreated,
      errorMessage: skipped > 0 ? `電話番号を読めない行が${skipped}件ありました` : null,
      log,
    });

    if (summary.diffsCreated > 0) {
      const breakdown = Object.entries(summary.byType ?? {})
        .map(([k, v]) => `${DIFF_TYPE_LABELS[k as keyof typeof DIFF_TYPE_LABELS] ?? k} ${v}件`)
        .join("、");
      await notify({
        level: "info",
        category: "concierge_diff",
        title: "コンシェル同期で差分が見つかりました",
        body: `${summary.diffsCreated}件${breakdown ? `（${breakdown}）` : ""}`,
        linkUrl: "/mobile/concierge",
        refTable: "concierge_sync_runs",
        refId: runId,
      });
    }

    return NextResponse.json({
      ok: true,
      linesSeen: summary.linesSeen,
      diffsCreated: summary.diffsCreated,
      skipped,
      detectRemovals,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("concierge observed ingest error:", e);
    await finishRun(runId, { status: "failed", errorMessage: msg, log });
    await notify({
      level: "error",
      category: "concierge_sync",
      title: "コンシェル同期の取り込みに失敗しました",
      body: msg,
      linkUrl: "/mobile/concierge",
      refTable: "concierge_sync_runs",
      refId: runId,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
