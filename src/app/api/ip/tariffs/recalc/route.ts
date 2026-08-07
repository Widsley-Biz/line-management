import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipUsages, ipUsageDetails, tenants } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { logActivity } from "@/lib/audit";
import { runInTransaction } from "@/lib/db/tx";
import {
  computeAmount,
  getTariffForTenant,
  recalcIpUsage,
  type CallCategory,
} from "@/lib/ip-billing";

/**
 * POST: 取引先の未送信の請求データを、現在のタリフで再計算する。
 *
 * 金額は取込時のタリフで計算して ip_usage_details.computed_amount に保存しているため、
 * あとからタリフを変えても既存の請求データには反映されない。タリフ設定画面から
 * 「再計算する」を選んだときにここを呼ぶ。
 *
 * SF送信済み・対応不要のデータは対象外（送信後に金額が変わると不整合になるため）。
 */
export async function POST(req: NextRequest) {
  try {
    const { tenantId } = (await req.json()) as { tenantId?: string };
    if (!tenantId) {
      return NextResponse.json({ error: "取引先IDは必須です" }, { status: 400 });
    }

    const targets = await db
      .select({ id: ipUsages.id, yearMonth: ipUsages.yearMonth, before: ipUsages.totalAmount })
      .from(ipUsages)
      .where(and(eq(ipUsages.tenantId, tenantId), eq(ipUsages.sfStatus, "未送信")));

    if (targets.length === 0) {
      return NextResponse.json({ success: true, updated: 0, results: [] });
    }

    const tariff = await getTariffForTenant(tenantId);
    const yearMonths = targets.map((t) => t.yearMonth);

    await runInTransaction(async () => {
      // 対象月の明細を現在のタリフで計算し直す
      const details = await db
        .select({
          id: ipUsageDetails.id,
          callCategory: ipUsageDetails.callCategory,
          totalSeconds: ipUsageDetails.totalSeconds,
          sourceAmount: ipUsageDetails.sourceAmount,
        })
        .from(ipUsageDetails)
        .where(
          and(
            eq(ipUsageDetails.tenantId, tenantId),
            inArray(ipUsageDetails.yearMonth, yearMonths)
          )
        );

      for (const d of details) {
        await db
          .update(ipUsageDetails)
          .set({
            computedAmount: computeAmount(
              d.callCategory as CallCategory,
              d.totalSeconds,
              d.sourceAmount,
              tariff
            ),
          })
          .where(eq(ipUsageDetails.id, d.id));
      }

      // 明細から請求金額を再集計（SF商品単位の切り上げもここで行われる）
      for (const ym of yearMonths) {
        await recalcIpUsage(tenantId, ym);
      }
    });

    const after = await db
      .select({ yearMonth: ipUsages.yearMonth, totalAmount: ipUsages.totalAmount })
      .from(ipUsages)
      .where(and(eq(ipUsages.tenantId, tenantId), eq(ipUsages.sfStatus, "未送信")));
    const afterMap = new Map(after.map((a) => [a.yearMonth, a.totalAmount]));

    const results = targets.map((t) => ({
      yearMonth: t.yearMonth,
      before: t.before,
      after: afterMap.get(t.yearMonth) ?? t.before,
    }));

    const [tenant] = await db
      .select({ companyName: tenants.companyName })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    await logActivity({
      actionType: "tariff_update",
      message: `タリフ変更にともない未送信の請求データを再計算: ${tenant?.companyName ?? tenantId}（${results.length}件）`,
      targetTable: "ip_usages",
      targetId: tenantId,
      afterJson: { tariff, results },
    });

    return NextResponse.json({ success: true, updated: results.length, results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP tariffs recalc error:", error);
    return NextResponse.json(
      { error: `再計算に失敗しました。変更は取り消されています。詳細: ${msg}` },
      { status: 500 }
    );
  }
}
