import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/audit";
import { importCdrFile, type CdrFileResult } from "@/lib/cdr-import";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    if (files.length === 0) {
      return NextResponse.json(
        { error: "CDR CSVファイルが選択されていません" },
        { status: 400 }
      );
    }

    const results: CdrFileResult[] = [];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const result = await importCdrFile(buffer, file.name);
      results.push(result);

      if (result.status === "imported") {
        await logActivity({
          actionType: "import",
          message: `CDR CSVインポート完了: ${file.name}（明細${result.importedRows}件、取引先${result.tenantCount}件、未紐付け${result.unmatchedNumbers?.length ?? 0}番号）`,
          targetTable: "ip_import_files",
          afterJson: {
            fileName: result.fileName,
            yearMonth: result.yearMonth,
            billingAccount: result.billingAccount,
            rowCount: result.rowCount,
            importedRows: result.importedRows,
            unmatched: result.unmatchedNumbers?.map((u) => u.phoneNumber),
            unknownCallTypes: result.unknownCallTypes,
          },
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("CDR import error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
