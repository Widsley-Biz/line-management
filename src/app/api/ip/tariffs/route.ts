import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipTariffs, ipUsages, tenants } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";
import { DEFAULT_TARIFF } from "@/lib/ip-billing";

function parseRates(body: Record<string, unknown>): { fixedRate: number; mobileRate: number; naviSecRate: number; naviAmountRate: number } | { error: string } {
  const fixedRate = Number(body.fixedRate);
  const mobileRate = Number(body.mobileRate);
  const naviSecRate = Number(body.naviSecRate);
  const naviAmountRate = Number(body.naviAmountRate);
  if (
    [fixedRate, mobileRate, naviSecRate, naviAmountRate].some(
      (v) => Number.isNaN(v) || v < 0
    )
  ) {
    return { error: "タリフの値が不正です" };
  }
  // ナビダイヤルは秒課金・金額課金のどちらか一方のみで計算するため、両方に値を入れることはできない
  if (naviSecRate > 0 && naviAmountRate > 0) {
    return { error: "ナビ秒課金とナビ金額課金は同時に設定できません（どちらかを0にしてください）" };
  }
  return { fixedRate, mobileRate, naviSecRate, naviAmountRate };
}

// デフォルトタリフの更新 / 取引先別タリフの登録・更新
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenantId = (body.tenantId as string | null) || null;
    const parsed = parseRates(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const rates = parsed;

    const now = new Date().toISOString();

    if (tenantId === null) {
      // デフォルトタリフ（tenant_id IS NULL）をupsert
      const [existing] = await db
        .select({ id: ipTariffs.id })
        .from(ipTariffs)
        .where(isNull(ipTariffs.tenantId))
        .limit(1);
      if (existing) {
        await db
          .update(ipTariffs)
          .set({ ...rates, updatedAt: now })
          .where(eq(ipTariffs.id, existing.id));
      } else {
        await db.insert(ipTariffs).values({
          id: "default",
          tenantId: null,
          ...rates,
          createdAt: now,
          updatedAt: now,
        });
      }
      await logActivity({
        actionType: "tariff_update",
        message: `デフォルトタリフを更新: 固定${rates.fixedRate} / 携帯${rates.mobileRate} / ナビ秒${rates.naviSecRate} / ナビ金額${rates.naviAmountRate}`,
        targetTable: "ip_tariffs",
        afterJson: rates,
      });
      return NextResponse.json({ success: true });
    }

    // 取引先別上書き（tenant_idで一意にupsert）
    const [existing] = await db
      .select({ id: ipTariffs.id })
      .from(ipTariffs)
      .where(eq(ipTariffs.tenantId, tenantId))
      .limit(1);
    if (existing) {
      await db
        .update(ipTariffs)
        .set({ ...rates, updatedAt: now })
        .where(eq(ipTariffs.id, existing.id));
    } else {
      await db.insert(ipTariffs).values({
        id: randomUUID(),
        tenantId,
        ...rates,
        createdAt: now,
        updatedAt: now,
      });
    }
    await logActivity({
      actionType: "tariff_update",
      message: `取引先別タリフを設定`,
      targetTable: "ip_tariffs",
      targetId: tenantId,
      afterJson: { tenantId, ...rates },
    });

    // 金額は取込時のタリフで計算して保存しているため、タリフを変えても既存の
    // 請求データは変わらない。未送信の請求データがあれば再計算するか確認できるよう、
    // 対象の件数と利用月を返す（SF送信済みは金額が変わると不整合になるため対象外）。
    const pending = await db
      .select({
        yearMonth: ipUsages.yearMonth,
        totalAmount: ipUsages.totalAmount,
      })
      .from(ipUsages)
      .where(
        and(eq(ipUsages.tenantId, tenantId), eq(ipUsages.sfStatus, "未送信"))
      );
    const [tenant] = await db
      .select({ companyName: tenants.companyName })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    return NextResponse.json({
      success: true,
      pendingRecalc:
        pending.length > 0
          ? {
              tenantId,
              tenantName: tenant?.companyName ?? "",
              count: pending.length,
              yearMonths: pending.map((p) => p.yearMonth).sort(),
              currentTotal: pending.reduce((s, p) => s + p.totalAmount, 0),
            }
          : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP tariffs POST error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// 取引先別上書きの解除（デフォルトに戻す）
export async function DELETE(req: NextRequest) {
  try {
    const { tenantId } = await req.json();
    if (!tenantId) {
      return NextResponse.json({ error: "取引先IDは必須です" }, { status: 400 });
    }
    await db.delete(ipTariffs).where(eq(ipTariffs.tenantId, tenantId));
    await logActivity({
      actionType: "tariff_update",
      message: `取引先別タリフを解除（デフォルトに戻す）`,
      targetTable: "ip_tariffs",
      targetId: tenantId,
    });
    return NextResponse.json({ success: true, default: DEFAULT_TARIFF });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP tariffs DELETE error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
