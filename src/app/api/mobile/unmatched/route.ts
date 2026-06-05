import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  mobileImportUnmatched,
  mobileUsages,
  mobileUsageDetails,
  tenants,
} from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { randomUUID } from "crypto";

// GET: pending な未照合一覧を返す
export async function GET() {
  const rows = await db
    .select()
    .from(mobileImportUnmatched)
    .where(ne(mobileImportUnmatched.status, "resolved"))
    .orderBy(mobileImportUnmatched.yearMonth, mobileImportUnmatched.rawName);
  return NextResponse.json(rows);
}

// PATCH: 取引先割当（assign）または無視（ignore）
export async function PATCH(req: NextRequest) {
  const { id, action, tenantId } = await req.json() as {
    id: string;
    action: "assign" | "ignore";
    tenantId?: string;
  };
  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (action === "ignore") {
    await db
      .update(mobileImportUnmatched)
      .set({ status: "ignored", updatedAt: now })
      .where(eq(mobileImportUnmatched.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "assign") {
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required for assign" }, { status: 400 });
    }

    const [row] = await db
      .select()
      .from(mobileImportUnmatched)
      .where(eq(mobileImportUnmatched.id, id));
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { yearMonth, overageTotal, itemsJson, phoneNumber } = row;
    const items = JSON.parse(itemsJson) as Record<string, number>;
    const sfStatus = overageTotal > 0 ? "未送信" : "超過なし";

    // mobileUsages を upsert
    const existing = await db
      .select({ id: mobileUsages.id, overageTotal: mobileUsages.overageTotal, totalLines: mobileUsages.totalLines })
      .from(mobileUsages)
      .where(and(eq(mobileUsages.tenantId, tenantId), eq(mobileUsages.yearMonth, yearMonth)))
      .then((r) => r[0] ?? null);

    let usageId: string;
    if (existing) {
      usageId = existing.id;
      const newTotal = existing.overageTotal + overageTotal;
      await db
        .update(mobileUsages)
        .set({ overageTotal: newTotal, totalLines: existing.totalLines + 1, sfStatus: newTotal > 0 ? "未送信" : "超過なし", updatedAt: now })
        .where(eq(mobileUsages.id, usageId));
    } else {
      usageId = randomUUID();
      await db.insert(mobileUsages).values({
        id: usageId,
        tenantId,
        yearMonth,
        totalLines: 1,
        overageTotal,
        sfStatus,
        importedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    // mobileUsageDetails に明細挿入
    const detailInserts = Object.entries(items).map(([itemName, amount]) => ({
      id: randomUUID(),
      mobileUsageId: usageId,
      tenantId,
      phoneNumber: phoneNumber ?? row.rawName,
      itemName,
      amount,
      yearMonth,
      createdAt: now,
    }));
    if (detailInserts.length > 0) {
      await db.insert(mobileUsageDetails).values(detailInserts);
    }

    // 未照合レコードを resolved に更新
    await db
      .update(mobileImportUnmatched)
      .set({ status: "resolved", resolvedTenantId: tenantId, updatedAt: now })
      .where(eq(mobileImportUnmatched.id, id));

    return NextResponse.json({ ok: true, usageId });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}

// DELETE: 未照合レコードを削除
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(mobileImportUnmatched).where(eq(mobileImportUnmatched.id, id));
  return NextResponse.json({ ok: true });
}
