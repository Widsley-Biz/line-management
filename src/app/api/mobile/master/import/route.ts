import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobileLines, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let inQuote = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

// 電話番号をハイフンあり形式に正規化（例: 09012345678 → 090-1234-5678）
function normalizePhone(raw: string): string {
  const digits = raw.replace(/-/g, "").trim();
  if (digits.length === 11 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  // フォーマット不明の場合はそのまま返す
  return raw.trim();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: "データ行がありません" }, { status: 400 });
    }

    // テナント名 → ID のマップを作成
    const allTenants = await db
      .select({ id: tenants.id, companyName: tenants.companyName })
      .from(tenants);
    const tenantMap = new Map(allTenants.map((t) => [t.companyName.trim(), t.id]));

    // 既存の電話番号を取得（重複チェック用）
    const existingLines = await db
      .select({ phoneNumber: mobileLines.phoneNumber })
      .from(mobileLines);
    const existingPhones = new Set(existingLines.map((l) => l.phoneNumber));

    const now = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;
    const unmatchedTenants: string[] = [];
    const duplicatePhones: string[] = [];
    const errors: string[] = [];

    // 1行目はヘッダーとしてスキップ
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 2) continue;

      const phoneNumber = normalizePhone(cols[0] ?? "");
      const companyName = cols[1]?.trim() ?? "";
      const status = (cols[2]?.trim() || "契約中") as "契約中" | "解約済";
      const contractStart = cols[3]?.trim() || null;
      const contractEnd = cols[4]?.trim() || null;
      const notes = cols[5]?.trim() || null;

      if (!phoneNumber || !companyName) {
        errors.push(`行${i + 1}: 電話番号または会社名が空です`);
        skipped++;
        continue;
      }

      // テナント照合
      const tenantId = tenantMap.get(companyName);
      if (!tenantId) {
        unmatchedTenants.push(companyName);
        skipped++;
        continue;
      }

      // 重複チェック
      if (existingPhones.has(phoneNumber)) {
        duplicatePhones.push(phoneNumber);
        skipped++;
        continue;
      }

      const id = randomUUID();
      await db.insert(mobileLines).values({
        id,
        phoneNumber,
        tenantId,
        status,
        contractStart: contractStart || null,
        contractEnd: contractEnd || null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      });

      existingPhones.add(phoneNumber); // 同一CSV内の重複も防ぐ
      inserted++;
    }

    await logActivity({
      actionType: "import",
      message: `回線マスタ一括インポート: 登録${inserted}件、スキップ${skipped}件`,
      afterJson: { inserted, skipped, unmatchedTenants, duplicatePhones },
    });

    return NextResponse.json({
      inserted,
      skipped,
      unmatchedTenants: [...new Set(unmatchedTenants)],
      duplicatePhones,
      errors,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Mobile master import error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
