import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  callLogs,
  tenants,
  phoneNumbers,
  mobileUsages,
  mobileUsageDetails,
  mobileBillingItems,
  mobileImportUnmatched,
} from "@/lib/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { calculateMonthlyBilling } from "@/lib/billing";
import { logActivity } from "@/lib/audit";

interface ImportResult {
  success: number;
  unmatched: string[];
  errors: string[];
}

type SoftBankResult = ImportResult & {
  preview?: {
    billingItems: string[];
    unknownItems: string[];
  };
};

async function importAdjustOne(
  text: string,
  yearMonth: string
): Promise<ImportResult> {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { success: 0, unmatched: [], errors: [] };

  const allTenants = await db
    .select({ id: tenants.id, companyName: tenants.companyName })
    .from(tenants);

  const tenantMap = new Map(allTenants.map((t) => [t.companyName.trim(), t.id]));

  const now = new Date().toISOString();
  let success = 0;
  const unmatched = new Set<string>();
  const errors: string[] = [];
  const affectedTenants = new Set<string>();

  const dataLines = lines.slice(1);
  const batchSize = 100;

  for (let i = 0; i < dataLines.length; i += batchSize) {
    const batch = dataLines.slice(i, i + batchSize);
    const inserts = [];

    for (const line of batch) {
      const cols = parseCsvLine(line);
      if (cols.length < 17) continue;

      const callTypeName = cols[7]?.trim() ?? "";
      const destinationType: "固定" | "携帯" = callTypeName.includes("携帯") ? "携帯" : "固定";
      const durationSeconds = parseInt(cols[13]?.trim() ?? "0", 10) || 0;
      const cost = parseFloat(cols[14]?.trim() ?? "0") || 0;
      const callDate = cols[9]?.trim() ?? "";
      const phoneNumber = cols[5]?.trim() ?? "";
      const destinationNumber = cols[8]?.trim() ?? "";
      const companyName = cols[16]?.trim() ?? "";

      if (!companyName) continue;

      const tenantId = tenantMap.get(companyName);
      if (!tenantId) {
        unmatched.add(companyName);
        continue;
      }

      inserts.push({
        id: randomUUID(),
        tenantId,
        yearMonth,
        callDate,
        phoneNumber,
        destinationNumber,
        destinationType,
        durationSeconds,
        cost,
        source: "AdjustOne" as const,
        importedAt: now,
      });
      affectedTenants.add(tenantId);
      success++;
    }

    if (inserts.length > 0) {
      await db.insert(callLogs).values(inserts);
    }
  }

  for (const tenantId of affectedTenants) {
    await calculateMonthlyBilling(tenantId, yearMonth);
  }

  await logActivity({
    actionType: "import",
    message: `AdjustOne CSVインポート完了: 成功${success}件、未照合${unmatched.size}件`,
    afterJson: { success, unmatched: Array.from(unmatched), yearMonth },
  });

  return { success, unmatched: Array.from(unmatched), errors };
}

async function importProDelight(
  text: string,
  yearMonth: string
): Promise<ImportResult> {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { success: 0, unmatched: [], errors: [] };

  const phoneRows = await db
    .select({
      number: phoneNumbers.number,
      tenantId: sql<string>`ta.tenant_id`,
    })
    .from(phoneNumbers)
    .innerJoin(
      sql`tenant_assignments ta`,
      sql`ta.phone_number_id = ${phoneNumbers.id} AND ta.end_month IS NULL`
    );

  const phoneToTenant = new Map<string, string>();
  for (const row of phoneRows) {
    if (row.tenantId) {
      const normalized = row.number.replace(/-/g, "");
      phoneToTenant.set(normalized, row.tenantId);
    }
  }

  const now = new Date().toISOString();
  let success = 0;
  const unmatched = new Set<string>();
  const errors: string[] = [];
  const affectedTenants = new Set<string>();

  const dataLines = lines.slice(1);
  const batchSize = 100;

  for (let i = 0; i < dataLines.length; i += batchSize) {
    const batch = dataLines.slice(i, i + batchSize);
    const inserts = [];

    for (const line of batch) {
      const cols = parseCsvLine(line);
      if (cols.length < 9) continue;

      const callType = cols[5]?.trim() ?? "";
      const destinationType: "固定" | "携帯" = callType.includes("携帯") ? "携帯" : "固定";
      const durationSeconds = parseInt(cols[7]?.trim() ?? "0", 10) || 0;
      const cost = parseFloat(cols[8]?.trim() ?? "0") || 0;
      const callDatetime = cols[6]?.trim() ?? "";
      const callDate = callDatetime.split(" ")[0] ?? "";
      const rawPhoneNumber = cols[3]?.trim() ?? "";
      const destinationNumber = cols[4]?.trim() ?? "";

      if (!rawPhoneNumber) continue;

      let normalized = rawPhoneNumber.replace(/-/g, "");
      if (normalized && !normalized.startsWith("0")) normalized = "0" + normalized;
      const tenantId = phoneToTenant.get(normalized);

      if (!tenantId) {
        unmatched.add(rawPhoneNumber);
        continue;
      }

      inserts.push({
        id: randomUUID(),
        tenantId,
        yearMonth,
        callDate,
        phoneNumber: normalized,
        destinationNumber,
        destinationType,
        durationSeconds,
        cost,
        source: "ProDelight" as const,
        importedAt: now,
      });
      affectedTenants.add(tenantId);
      success++;
    }

    if (inserts.length > 0) {
      await db.insert(callLogs).values(inserts);
    }
  }

  for (const tenantId of affectedTenants) {
    await calculateMonthlyBilling(tenantId, yearMonth);
  }

  await logActivity({
    actionType: "import",
    message: `ProDelight CSVインポート完了: 成功${success}件、未照合${unmatched.size}件`,
    afterJson: { success, unmatched: Array.from(unmatched), yearMonth },
  });

  return { success, unmatched: Array.from(unmatched), errors };
}

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

// ── SoftBank インポート（Excel / CSV 自動判別）──────────────────────────────
async function importSoftBank(
  buffer: ArrayBuffer,
  yearMonth: string,
  isCSV: boolean,
  options: { previewOnly?: boolean } = {}
): Promise<SoftBankResult> {
  const { previewOnly = false } = options;

  // DB から課金項目マスタを全件取得（項目名をキーに）
  const dbItems = await db.select().from(mobileBillingItems);

  // マスタ登録済み項目名（未登録判定用）
  const knownNames = new Set<string>(dbItems.map((i) => i.itemName));

  // 集計対象は継続取込=true の項目のみ
  type ItemEntry = { isBillable: boolean };
  const itemMap = new Map<string, ItemEntry>(
    dbItems
      .filter((i) => i.continuousImport)
      .map((i) => [i.itemName, { isBillable: i.isBillable }])
  );

  // 氏名 → 取引先マッピング（回線マスタ不要）
  const allTenants = await db
    .select({ id: tenants.id, companyName: tenants.companyName })
    .from(tenants);
  const nameToTenant = new Map<string, string>(
    allTenants.map((t) => [t.companyName.trim(), t.id])
  );

  // ヘッダ行・データ行をバッファ
  let headerRow: (string | number | null | undefined)[] = [];
  const dataRows: (string | number | null | undefined)[][] = [];

  if (isCSV) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length > 0) {
      headerRow = [null, ...parseCsvLine(lines[0])];
    }
    // プレビューモードはヘッダー行（1行目）のみ使用
    if (!previewOnly) {
      for (const line of lines.slice(2)) {
        dataRows.push([null, ...parseCsvLine(line)]);
      }
    }
  } else {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const ws = workbook.getWorksheet("ご利用分析サービス");
    if (!ws) return { success: 0, unmatched: [], errors: ["シートが見つかりません"] };
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 2) {
        headerRow = row.values as (string | number | null | undefined)[];
      }
      if (rowNumber <= 2) return;
      // プレビューモードはヘッダー行（1行目）のみ使用
      if (!previewOnly) {
        dataRows.push(row.values as (string | number | null | undefined)[]);
      }
    });
  }

  // 課金項目らしい列かどうかを判定するキーワード（メタデータ列を除外するため）
  const BILLING_HEADER_KEYWORDS = [
    "基本料", "通話料", "通信料", "月額料", "手数料", "情報料",
    "定額料", "使用料", "代行分", "調整金", "利用料", "その他　",
    "　無料", "　割引",
  ];
  const isBillingHeader = (h: string) =>
    BILLING_HEADER_KEYWORDS.some((kw) => h.includes(kw));

  // ヘッダ行から「列インデックス → 項目名」マップを構築
  // - マスタ登録済み → colNameMap に追加（集計対象）
  // - 未登録かつ課金項目らしい → unknownItems に追加（要分類）
  // - 未登録かつ非課金項目（ICCID, 氏名 etc.）→ 無視
  const colNameMap = new Map<number, string>(); // colIdx → itemName
  const unknownItems: string[] = [];
  for (let i = 4; i < headerRow.length; i++) {
    const h = String(headerRow[i] ?? "").trim();
    if (!h) continue;
    if (itemMap.has(h)) {
      colNameMap.set(i, h);
    } else if (!knownNames.has(h) && isBillingHeader(h)) {
      unknownItems.push(h);
    }
    // それ以外（ICCID・機種契約番号・氏名・料金プラン名称 等）は無視
  }

  // プレビューモード：完全一致した課金項目と未登録項目を返すだけ（DB書込なし）
  if (previewOnly) {
    const billingItems: string[] = [];
    for (const [, itemName] of colNameMap) {
      if (itemMap.get(itemName)?.isBillable) billingItems.push(itemName);
    }
    return { success: 0, unmatched: [], errors: [], preview: { billingItems, unknownItems } };
  }

  // マスタ未登録項目がある場合はインポートを中止（マスタ登録後に再実行してもらう）
  if (unknownItems.length > 0) {
    return {
      success: 0,
      unmatched: [],
      errors: [
        `マスタ未登録の項目があるためインポートを中止しました。課金項目マスタで登録してから再実行してください: ${unknownItems.join("、")}`,
      ],
    };
  }

  // ヘッダ行から氏名・電話番号の列インデックスを動的検出（列1〜3を走査）
  let nameColIdx = 2; // デフォルト col B
  let phoneColIdx = 3; // デフォルト col C
  const nameKeywords = ["氏名", "利用者", "契約者", "お名前", "ご利用者", "名前"];
  const phoneKeywords = ["電話番号", "電話", "TEL", "tel", "携帯番号"];
  // 課金項目開始列(=colNameMap/unknownItemsスキャン開始)の手前まで走査
  for (let i = 1; i <= 12; i++) {
    const h = String(headerRow[i] ?? "").trim();
    if (h && nameKeywords.some((k) => h.includes(k))) nameColIdx = i;
    if (h && phoneKeywords.some((k) => h.includes(k))) phoneColIdx = i;
  }

  // データ行を処理
  const tenantOverage = new Map<string, number>();
  const tenantLines = new Map<string, Set<string>>();
  const detailMap = new Map<string, Map<string, Array<{ itemName: string; amount: number }>>>();

  // 未照合: rawName → { rawName, phoneNumber, overageTotal, items }
  type UnmatchedEntry = { rawName: string; phoneNumber: string; overageTotal: number; items: Record<string, number> };
  const unmatchedMap = new Map<string, UnmatchedEntry>();

  for (const values of dataRows) {
    const rawName = String(values[nameColIdx] ?? "").trim();
    const rawPhone = String(values[phoneColIdx] ?? "").trim();
    if (!rawName && !rawPhone) continue;

    const tenantId = nameToTenant.get(rawName);
    if (!tenantId) {
      // 未照合行を集計
      if (!unmatchedMap.has(rawName)) {
        unmatchedMap.set(rawName, { rawName, phoneNumber: rawPhone, overageTotal: 0, items: {} });
      }
      const entry = unmatchedMap.get(rawName)!;
      for (const [colIdx, itemName] of colNameMap) {
        const raw = values[colIdx];
        const val = typeof raw === "number" ? raw : parseFloat(String(raw ?? "")) || 0;
        if (val <= 0) continue;
        const dbItem = itemMap.get(itemName);
        if (dbItem?.isBillable) {
          entry.overageTotal += val;
          entry.items[itemName] = (entry.items[itemName] ?? 0) + val;
        }
      }
      continue;
    }

    if (!tenantLines.has(tenantId)) tenantLines.set(tenantId, new Set());
    tenantLines.get(tenantId)!.add(rawPhone || rawName); // 回線識別子

    let overageSum = 0;
    for (const [colIdx, itemName] of colNameMap) {
      const raw = values[colIdx];
      const val = typeof raw === "number" ? raw : parseFloat(String(raw ?? "")) || 0;
      if (val <= 0) continue;

      // colNameMap はマスタと完全一致した列のみ
      if (itemMap.get(itemName)?.isBillable) {
        overageSum += val;
        if (!detailMap.has(tenantId)) detailMap.set(tenantId, new Map());
        const phoneMap = detailMap.get(tenantId)!;
        if (!phoneMap.has(rawPhone)) phoneMap.set(rawPhone, []);
        phoneMap.get(rawPhone)!.push({ itemName, amount: val });
      }
    }

    tenantOverage.set(tenantId, (tenantOverage.get(tenantId) ?? 0) + overageSum);
  }

  const now = new Date().toISOString();
  let success = 0;

  for (const [tenantId, overageTotal] of tenantOverage.entries()) {
    const totalLines = tenantLines.get(tenantId)?.size ?? 0;
    const sfStatus = overageTotal > 0 ? "未送信" : "超過なし";

    const existing = await db
      .select({ id: mobileUsages.id })
      .from(mobileUsages)
      .where(
        and(
          eq(mobileUsages.tenantId, tenantId),
          eq(mobileUsages.yearMonth, yearMonth)
        )
      )
      .then((rows) => rows[0] ?? null);

    let usageId: string;

    if (existing) {
      usageId = existing.id;
      await db
        .update(mobileUsages)
        .set({ overageTotal, totalLines, sfStatus, importedAt: now, updatedAt: now })
        .where(eq(mobileUsages.id, usageId));
      await db
        .delete(mobileUsageDetails)
        .where(eq(mobileUsageDetails.mobileUsageId, usageId));
    } else {
      usageId = randomUUID();
      await db.insert(mobileUsages).values({
        id: usageId,
        tenantId,
        yearMonth,
        totalLines,
        overageTotal,
        sfStatus,
        importedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const phoneMap = detailMap.get(tenantId);
    if (phoneMap) {
      const detailInserts = [];
      for (const [phoneNumber, items] of phoneMap.entries()) {
        for (const { itemName, amount } of items) {
          detailInserts.push({
            id: randomUUID(),
            mobileUsageId: usageId,
            tenantId,
            phoneNumber,
            itemName,
            amount,
            yearMonth,
            createdAt: now,
          });
        }
      }
      if (detailInserts.length > 0) {
        await db.insert(mobileUsageDetails).values(detailInserts);
      }
    }

    success++;
  }

  // 未照合行を DB に保存（pending のみ削除→再挿入、resolved/ignored は保持）
  if (unmatchedMap.size > 0) {
    const pendingIds = await db
      .select({ id: mobileImportUnmatched.id })
      .from(mobileImportUnmatched)
      .where(
        and(
          eq(mobileImportUnmatched.yearMonth, yearMonth),
          eq(mobileImportUnmatched.status, "pending")
        )
      );
    if (pendingIds.length > 0) {
      await db
        .delete(mobileImportUnmatched)
        .where(inArray(mobileImportUnmatched.id, pendingIds.map((r) => r.id)));
    }
    const unmatchedInserts = Array.from(unmatchedMap.values()).map((entry) => ({
      id: randomUUID(),
      yearMonth,
      rawName: entry.rawName,
      phoneNumber: entry.phoneNumber || null,
      overageTotal: entry.overageTotal,
      itemsJson: JSON.stringify(entry.items),
      status: "pending" as const,
      importedAt: now,
      createdAt: now,
      updatedAt: now,
    }));
    await db.insert(mobileImportUnmatched).values(unmatchedInserts);
  }

  const unmatchedNames = Array.from(unmatchedMap.keys());

  // 検出した列情報をログに記録（デバッグ用）
  const colInfo = {
    nameCol: { idx: nameColIdx, header: String(headerRow[nameColIdx] ?? "") },
    phoneCol: { idx: phoneColIdx, header: String(headerRow[phoneColIdx] ?? "") },
  };

  await logActivity({
    actionType: "import",
    message: `SoftBank ${isCSV ? "CSV" : "Excel"}インポート完了: 成功${success}社、未照合${unmatchedNames.length}件`,
    afterJson: { success, unmatched: unmatchedNames, yearMonth, colInfo },
  });

  return { success, unmatched: unmatchedNames, errors: [], colInfo } as SoftBankResult & { colInfo: typeof colInfo };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const yearMonth = formData.get("yearMonth") as string;

    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: "年月の形式が不正です (YYYY-MM)" }, { status: 400 });
    }

    const adjustOneFile = formData.get("adjustOne") as File | null;
    const proDelightFile = formData.get("proDelight") as File | null;
    const softBankFile = formData.get("softBank") as File | null;

    const result: Record<string, ImportResult> = {};

    if (adjustOneFile) {
      const text = await adjustOneFile.text();
      result.adjustOne = await importAdjustOne(text, yearMonth);
    }

    if (proDelightFile) {
      const text = await proDelightFile.text();
      result.proDelight = await importProDelight(text, yearMonth);
    }

    if (softBankFile) {
      const buffer = await softBankFile.arrayBuffer();
      const isCSV = softBankFile.name.toLowerCase().endsWith(".csv");
      const previewOnly = formData.get("previewOnly") === "true";
      result.softBank = await importSoftBank(buffer, yearMonth, isCSV, { previewOnly });
    }

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Import error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}