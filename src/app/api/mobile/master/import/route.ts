import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobileLines, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";
import { phoneMatchKey } from "@/lib/phone";
import { requireRole } from "@/lib/api-auth";

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

// ICCID / IMEI からハイフン・空白を除いて数字だけにする。空なら null
function normalizeDigits(raw: string | undefined): string | null {
  const v = (raw ?? "").replace(/[\s-]/g, "").trim();
  return v === "" ? null : v;
}

export async function POST(req: NextRequest) {
  const guard = await requireRole(["admin", "leader"]);
  if (!guard.ok) return guard.response;
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
      if (cols.length < 4) continue;

      // 列順: 電話番号,ICCID,IMEI,会社名,ステータス,契約開始日,解約日,備考
      const phoneNumber = normalizePhone(cols[0] ?? "");
      const iccid = normalizeDigits(cols[1]);
      const imei = normalizeDigits(cols[2]);
      const companyName = cols[3]?.trim() ?? "";
      const status = (cols[4]?.trim() || "契約中") as "契約中" | "解約済";
      const contractStart = cols[5]?.trim() || null;
      const contractEnd = cols[6]?.trim() || null;
      const notes = cols[7]?.trim() || null;

      if (!phoneNumber || !companyName) {
        errors.push(`行${i + 1}: 電話番号または会社名が空です`);
        skipped++;
        continue;
      }

      // 桁数が合わないものは、行ごと落とさず該当項目だけ空にして取り込む。
      // 判定は コンシェル同期の validateIdentifiers と同じ基準に揃える。
      let validIccid = iccid;
      let validImei = imei;
      if (validIccid && !/^\d{19,20}$/.test(validIccid)) {
        errors.push(`行${i + 1}: ICCIDの形式が不正なため空で登録します（${validIccid}）`);
        validIccid = null;
      }
      if (validImei && !/^\d{15}$/.test(validImei)) {
        errors.push(`行${i + 1}: IMEIの形式が不正なため空で登録します（${validImei}）`);
        validImei = null;
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
        // コンシェル同期の突合キー
        phoneKey: phoneMatchKey(phoneNumber),
        tenantId,
        status,
        iccid: validIccid,
        imei: validImei,
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
