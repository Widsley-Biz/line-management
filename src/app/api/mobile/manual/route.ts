import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobileUsages, mobileUsageDetails, mobileLines } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const { phoneNumber, yearMonth, itemName, amount } = await req.json();

    if (!phoneNumber || !yearMonth || !itemName || amount === undefined) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }

    // 電話番号からテナントを検索（ハイフンあり・なし両対応）
    const normalized = phoneNumber.replace(/-/g, "");
    const line = await db
      .select({ tenantId: mobileLines.tenantId, phoneNumber: mobileLines.phoneNumber })
      .from(mobileLines)
      .where(
        or(
          eq(mobileLines.phoneNumber, phoneNumber),
          eq(mobileLines.phoneNumber, normalized)
        )
      )
      .then((rows) => rows[0] ?? null);

    if (!line) {
      return NextResponse.json({
        error: `電話番号 ${phoneNumber} はマスタに登録されていません`,
      }, { status: 404 });
    }

    const { tenantId } = line;
    const now = new Date().toISOString();

    // mobile_usages を upsert
    const existing = await db
      .select({ id: mobileUsages.id, overageTotal: mobileUsages.overageTotal })
      .from(mobileUsages)
      .where(and(
        eq(mobileUsages.tenantId, tenantId),
        eq(mobileUsages.yearMonth, yearMonth)
      ))
      .then((rows) => rows[0] ?? null);

    let usageId: string;

    if (existing) {
      usageId = existing.id;
      const newTotal = existing.overageTotal + amount;
      await db.update(mobileUsages).set({
        overageTotal: newTotal,
        sfStatus: newTotal > 0 ? "未送信" : "超過なし",
        updatedAt: now,
      }).where(eq(mobileUsages.id, usageId));
    } else {
      usageId = randomUUID();
      await db.insert(mobileUsages).values({
        id: usageId,
        tenantId,
        yearMonth,
        totalLines: 1,
        overageTotal: amount,
        sfStatus: amount > 0 ? "未送信" : "超過なし",
        importedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    // mobile_usage_details に追加
    await db.insert(mobileUsageDetails).values({
      id: randomUUID(),
      mobileUsageId: usageId,
      tenantId,
      phoneNumber: normalized,
      itemName,
      amount,
      yearMonth,
      createdAt: now,
    });

    await logActivity({
      actionType: "import",
      message: `携帯回線手動入力: ${normalized} ${itemName} ${amount}円`,
      targetTable: "mobile_usages",
      afterJson: { phoneNumber: normalized, yearMonth, itemName, amount },
    });

    return NextResponse.json({ success: true, tenantId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}