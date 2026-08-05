import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  mobileImportUnmatched,
  mobileUsages,
  mobileUsageDetails,
  tenants,
} from "@/lib/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";
import { runInTransaction } from "@/lib/db/tx";

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
  try {
    return await patchUnmatched(req);
  } catch (error) {
    // 失敗時はトランザクションがロールバックされ、金額は加算されていない
    const detail = error instanceof Error ? error.message : "不明なエラー";
    console.error("Mobile unmatched PATCH error:", error);
    return NextResponse.json(
      {
        error: `処理に失敗しました。変更は取り消されています（金額は加算されていません）。そのまま再実行して問題ありません。詳細: ${detail}`,
      },
      { status: 500 }
    );
  }
}

async function patchUnmatched(req: NextRequest) {
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
    if (row.status === "resolved") {
      return NextResponse.json(
        {
          error:
            "この未照合レコードは既に処理済みです。二重計上を防ぐため中止しました。画面を再読み込みしてください。",
        },
        { status: 409 }
      );
    }

    const { yearMonth, overageTotal, itemsJson, phoneNumber } = row;
    const items = JSON.parse(itemsJson) as Record<string, number>;
    const sfStatus = overageTotal > 0 ? "未送信" : "超過なし";

    let usageId = "";

    // 加算・明細挿入・状態更新は1トランザクションにまとめる。
    // 途中で失敗すると金額だけ加算され、再実行で二重計上になるため。
    await runInTransaction(async () => {
      // 処理済みかどうかはトランザクション内で再確認する（二重送信の防止）。
      // トランザクションは直列化されるため、ここで resolved なら先の処理が完了している。
      const [current] = await db
        .select({ status: mobileImportUnmatched.status })
        .from(mobileImportUnmatched)
        .where(eq(mobileImportUnmatched.id, id));
      if (!current || current.status === "resolved") {
        throw new Error("この未照合レコードは既に処理済みです（二重計上を防ぐため中止しました）");
      }

      // mobileUsages を upsert
      const existing = await db
        .select({ id: mobileUsages.id, overageTotal: mobileUsages.overageTotal, totalLines: mobileUsages.totalLines })
        .from(mobileUsages)
        .where(and(eq(mobileUsages.tenantId, tenantId), eq(mobileUsages.yearMonth, yearMonth)))
        .then((r) => r[0] ?? null);

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
    });

    return NextResponse.json({ ok: true, usageId });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}

// DELETE: 未照合レコードを削除（単体 id / 複数 ids の一括削除に対応）
export async function DELETE(req: NextRequest) {
  const body = await req.json();

  if (Array.isArray(body?.ids)) {
    const ids: string[] = body.ids.filter((v: unknown) => typeof v === "string");
    if (ids.length === 0) {
      return NextResponse.json({ error: "ids is empty" }, { status: 400 });
    }
    await db
      .delete(mobileImportUnmatched)
      .where(inArray(mobileImportUnmatched.id, ids));
    await logActivity({
      actionType: "delete",
      message: `携帯未照合を選択削除: ${ids.length}件`,
      targetTable: "mobile_import_unmatched",
    });
    return NextResponse.json({ ok: true, deleted: ids.length });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(mobileImportUnmatched).where(eq(mobileImportUnmatched.id, id));
  return NextResponse.json({ ok: true });
}
