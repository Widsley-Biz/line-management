import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipTariffs } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";
import { DEFAULT_TARIFF } from "@/lib/ip-billing";

function parseRates(body: Record<string, unknown>) {
  const fixedRate = Number(body.fixedRate);
  const mobileRate = Number(body.mobileRate);
  const naviSecRate = Number(body.naviSecRate);
  const naviAmountRate = Number(body.naviAmountRate);
  if (
    [fixedRate, mobileRate, naviSecRate, naviAmountRate].some(
      (v) => Number.isNaN(v) || v < 0
    )
  ) {
    return null;
  }
  return { fixedRate, mobileRate, naviSecRate, naviAmountRate };
}

// デフォルトタリフの更新 / 取引先別タリフの登録・更新
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenantId = (body.tenantId as string | null) || null;
    const rates = parseRates(body);
    if (!rates) {
      return NextResponse.json({ error: "タリフの値が不正です" }, { status: 400 });
    }

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
    return NextResponse.json({ success: true });
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
