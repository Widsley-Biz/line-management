import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipImportFiles } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireRole } from "@/lib/api-auth";

// GET: 取込済みCDRファイルの一覧（同じファイルを二重に取り込まないための確認用）
export async function GET() {
  // 呼び出し元は /import 画面だけ。その画面は admin / leader 限定
  const guard = await requireRole(["admin", "leader"]);
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({
      id: ipImportFiles.id,
      fileName: ipImportFiles.fileName,
      billingAccount: ipImportFiles.billingAccount,
      yearMonth: ipImportFiles.yearMonth,
      rowCount: ipImportFiles.rowCount,
      importedAt: ipImportFiles.importedAt,
    })
    .from(ipImportFiles)
    .orderBy(desc(ipImportFiles.importedAt));
  return NextResponse.json(rows);
}
