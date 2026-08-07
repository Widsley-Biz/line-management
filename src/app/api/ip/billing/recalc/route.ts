import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipUsages } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { logActivity } from "@/lib/audit";
import { runInTransaction } from "@/lib/db/tx";
import { recalcIpUsage } from "@/lib/ip-billing";

/**
 * POST: 指定した利用年月の未送信の請求データを、保存済みの明細から再集計する。
 *
 * 端数処理のルールを変更した場合など、明細（computed_amount）は変えずに
 * 集計だけをやり直したいときに使う。単価を変えて計算し直す場合は
 * タリフ設定画面からの再計算（/api/ip/tariffs/recalc）を使う。
 *
 * SF送信済み・対応不要のデータは、送信後に金額が変わると不整合になるため対象外。
 */
export async function POST(req: NextRequest) {
  try {
    const { yearMonth } = (await req.json()) as { yearMonth?: string };
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: "利用年月の形式が不正です (YYYY-MM)" }, { status: 400 });
    }

    const targets = await db
      .select({ tenantId: ipUsages.tenantId, before: ipUsages.totalAmount })
      .from(ipUsages)
      .where(and(eq(ipUsages.yearMonth, yearMonth), eq(ipUsages.sfStatus, "未送信")));

    if (targets.length === 0) {
      return NextResponse.json({ success: true, updated: 0, changed: 0, diff: 0 });
    }

    await runInTransaction(async () => {
      for (const t of targets) {
        await recalcIpUsage(t.tenantId, yearMonth);
      }
    });

    const after = await db
      .select({ tenantId: ipUsages.tenantId, totalAmount: ipUsages.totalAmount })
      .from(ipUsages)
      .where(and(eq(ipUsages.yearMonth, yearMonth), eq(ipUsages.sfStatus, "未送信")));
    const afterMap = new Map(after.map((a) => [a.tenantId, a.totalAmount]));

    let changed = 0;
    let diff = 0;
    for (const t of targets) {
      const now = afterMap.get(t.tenantId) ?? t.before;
      if (now !== t.before) {
        changed++;
        diff += now - t.before;
      }
    }

    await logActivity({
      actionType: "tariff_update",
      message: `${yearMonth}の未送信の請求データを再集計: ${targets.length}件中${changed}件の金額が変動（合計${diff >= 0 ? "+" : ""}${diff}円）`,
      targetTable: "ip_usages",
      afterJson: { yearMonth, total: targets.length, changed, diff },
    });

    return NextResponse.json({ success: true, updated: targets.length, changed, diff });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP billing recalc error:", error);
    return NextResponse.json(
      { error: `再集計に失敗しました。変更は取り消されています。詳細: ${msg}` },
      { status: 500 }
    );
  }
}
