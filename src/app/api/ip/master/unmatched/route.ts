import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipMasterUnmatched, ipNumbers } from "@/lib/db/schema";
import { eq, ne, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";

// GET: 未解決の番号マスタ未照合一覧を返す
export async function GET() {
  const rows = await db
    .select()
    .from(ipMasterUnmatched)
    .where(ne(ipMasterUnmatched.status, "resolved"))
    .orderBy(ipMasterUnmatched.phoneNumber);
  return NextResponse.json(rows);
}

// PATCH: 取引先割当（assign、ip_numbersに登録）または無視（ignore）
export async function PATCH(req: NextRequest) {
  try {
    const { id, action, tenantId } = (await req.json()) as {
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
        .update(ipMasterUnmatched)
        .set({ status: "ignored", updatedAt: now })
        .where(eq(ipMasterUnmatched.id, id));
      return NextResponse.json({ ok: true });
    }

    if (action === "assign") {
      if (!tenantId) {
        return NextResponse.json({ error: "tenantId required for assign" }, { status: 400 });
      }

      const [row] = await db
        .select()
        .from(ipMasterUnmatched)
        .where(eq(ipMasterUnmatched.id, id));
      if (!row) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }

      const [existingPhone] = await db
        .select({ id: ipNumbers.id })
        .from(ipNumbers)
        .where(eq(ipNumbers.phoneNumber, row.phoneNumber));
      if (existingPhone) {
        return NextResponse.json(
          { error: "この電話番号は既に番号マスタに登録済みです" },
          { status: 409 }
        );
      }

      await db.insert(ipNumbers).values({
        id: randomUUID(),
        phoneNumber: row.phoneNumber,
        subNumber: row.subNumber,
        tenantId,
        status: "契約中",
        notes: row.notes,
        createdAt: now,
        updatedAt: now,
      });

      await db
        .update(ipMasterUnmatched)
        .set({ status: "resolved", resolvedTenantId: tenantId, updatedAt: now })
        .where(eq(ipMasterUnmatched.id, id));

      await logActivity({
        actionType: "tenant_update",
        message: `IP番号マスタ未照合番号を取引先に割当`,
        targetTable: "ip_master_unmatched",
        targetId: id,
        afterJson: { tenantId, phoneNumber: row.phoneNumber },
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP master unmatched PATCH error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: 未照合レコードを削除（単一idのid、または複数選択のids配列）
export async function DELETE(req: NextRequest) {
  const body = await req.json();

  if (Array.isArray(body?.ids)) {
    const ids: string[] = body.ids.filter((v: unknown) => typeof v === "string");
    if (ids.length === 0) {
      return NextResponse.json({ error: "ids is empty" }, { status: 400 });
    }
    await db.delete(ipMasterUnmatched).where(inArray(ipMasterUnmatched.id, ids));
    await logActivity({
      actionType: "delete",
      message: `IP番号マスタ未照合を選択削除: ${ids.length}件`,
      targetTable: "ip_master_unmatched",
    });
    return NextResponse.json({ ok: true, deleted: ids.length });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(ipMasterUnmatched).where(eq(ipMasterUnmatched.id, id));
  return NextResponse.json({ ok: true });
}
