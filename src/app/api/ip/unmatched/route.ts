import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipImportUnmatched } from "@/lib/db/schema";
import { eq, ne } from "drizzle-orm";
import { logActivity } from "@/lib/audit";
import { assignUnmatchedToTenant } from "@/lib/cdr-import";

// GET: 未解決の未照合一覧を返す
export async function GET() {
  const rows = await db
    .select()
    .from(ipImportUnmatched)
    .where(ne(ipImportUnmatched.status, "resolved"))
    .orderBy(ipImportUnmatched.yearMonth, ipImportUnmatched.phoneNumber);
  return NextResponse.json(rows);
}

// PATCH: 取引先割当（assign）または無視（ignore）
export async function PATCH(req: NextRequest) {
  try {
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
        .update(ipImportUnmatched)
        .set({ status: "ignored", updatedAt: now })
        .where(eq(ipImportUnmatched.id, id));
      return NextResponse.json({ ok: true });
    }

    if (action === "assign") {
      if (!tenantId) {
        return NextResponse.json({ error: "tenantId required for assign" }, { status: 400 });
      }

      const result = await assignUnmatchedToTenant(id, tenantId);
      if (!result.ok) {
        // 既に処理済み（二重送信）は409、レコード不在は404
        const status = result.error?.includes("処理済み") ? 409 : 404;
        return NextResponse.json({ error: result.error }, { status });
      }

      await logActivity({
        actionType: "tenant_update",
        message: `IP未照合番号を取引先に割当`,
        targetTable: "ip_import_unmatched",
        targetId: id,
        afterJson: { tenantId, usageId: result.usageId },
      });

      return NextResponse.json({ ok: true, usageId: result.usageId });
    }

    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP unmatched PATCH error:", error);
    // トランザクションでロールバック済みなので、金額は加算されていない
    return NextResponse.json(
      { error: `${msg}（変更は取り消されており、金額は加算されていません）` },
      { status: 500 }
    );
  }
}

// DELETE: 未照合レコードを削除
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(ipImportUnmatched).where(eq(ipImportUnmatched.id, id));
  return NextResponse.json({ ok: true });
}
