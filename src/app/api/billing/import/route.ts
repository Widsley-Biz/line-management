import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  callLogs,
  tenants,
  phoneNumbers,
  mobileLines,
  mobileUsages,
  mobileUsageDetails,
  mobileBillingItems,
} from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { calculateMonthlyBilling } from "@/lib/billing";
import { logActivity } from "@/lib/audit";

interface ImportResult {
  success: number;
  unmatched: string[];
  errors: string[];
}

interface UnknownItem {
  itemName: string;
  maxAmount: number;
}

interface ClassifiedItem {
  itemName: string;
  isBillable: boolean;
  continuousImport: boolean;
}

type SoftBankResult = ImportResult & {
  requiresClassification?: boolean;
  unknownItems?: UnknownItem[];
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
// 課金項目と判断するヘッダキーワード
const BILLING_HEADER_KEYWORDS = ["料", "代行分", "その他　"];

function isBillingHeader(header: string): boolean {
  return BILLING_HEADER_KEYWORDS.some((kw) => header.includes(kw));
}

async function importSoftBank(
  buffer: ArrayBuffer,
  yearMonth: string,
  isCSV: boolean,
  newItemClassifications?: ClassifiedItem[]
): Promise<SoftBankResult> {
  // DB から継続取込=true の課金項目マスタを取得（項目名をキーに）
  const dbItems = await db
    .select()
    .from(mobileBillingItems)
    .where(eq(mobileBillingItems.continuousImport, true));

  type ItemEntry = { isBillable: boolean };
  const itemMap = new Map<string, ItemEntry>(
    dbItems.map((i) => [i.itemName, { isBillable: i.isBillable }])
  );
  // 今回分類された項目もマップに追加（継続/今回のみ問わず）
  if (newItemClassifications) {
    for (const cls of newItemClassifications) {
      itemMap.set(cls.itemName, { isBillable: cls.isBillable });
    }
  }

  const lineRows = await db
    .select({ phoneNumber: mobileLines.phoneNumber, tenantId: mobileLines.tenantId })
    .from(mobileLines)
    .where(eq(mobileLines.status, "契約中"));

  const phoneToTenant = new Map<string, string>();
  for (const row of lineRows) {
    phoneToTenant.set(row.phoneNumber, row.tenantId);
    phoneToTenant.set(row.phoneNumber.replace(/-/g, ""), row.tenantId);
  }

  // ヘッダ行・データ行をバッファ
  let headerRow: (string | number | null | undefined)[] = [];
  const dataRows: (string | number | null | undefined)[][] = [];

  if (isCSV) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length > 0) {
      headerRow = [null, ...parseCsvLine(lines[0])];
    }
    for (const line of lines.slice(2)) {
      dataRows.push([null, ...parseCsvLine(line)]);
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
      dataRows.push(row.values as (string | number | null | undefined)[]);
    });
  }

  // ヘッダ行から「列インデックス → 項目名」マップを構築
  // 課金項目候補（DBに登録済み、またはキーワードを含む列）のみ対象
  const colNameMap = new Map<number, string>(); // colIdx → itemName
  for (let i = 4; i < headerRow.length; i++) {
    const h = String(headerRow[i] ?? "").trim();
    if (!h) continue;
    if (itemMap.has(h) || isBillingHeader(h)) {
      colNameMap.set(i, h);
    }
  }

  // データ行を処理
  const tenantOverage = new Map<string, number>();
  const tenantLines = new Map<string, Set<string>>();
  const unmatched = new Set<string>();
  const detailMap = new Map<string, Map<string, Array<{ itemName: string; amount: number }>>>();
  const unknownNames = new Map<string, number>(); // itemName → maxAmount

  for (const values of dataRows) {
    const rawPhone = String(values[3] ?? "").trim();
    if (!rawPhone) continue;

    const tenantId =
      phoneToTenant.get(rawPhone) ?? phoneToTenant.get(rawPhone.replace(/-/g, ""));
    if (!tenantId) {
      unmatched.add(rawPhone);
      continue;
    }

    if (!tenantLines.has(tenantId)) tenantLines.set(tenantId, new Set());
    tenantLines.get(tenantId)!.add(rawPhone);

    let overageSum = 0;
    for (const [colIdx, itemName] of colNameMap) {
      const raw = values[colIdx];
      const val = typeof raw === "number" ? raw : parseFloat(String(raw ?? "")) || 0;
      if (val <= 0) continue;

      const dbItem = itemMap.get(itemName);
      if (dbItem !== undefined) {
        // 既知項目：課金なら超過に加算
        if (dbItem.isBillable) {
          overageSum += val;
          if (!detailMap.has(tenantId)) detailMap.set(tenantId, new Map());
          const phoneMap = detailMap.get(tenantId)!;
          if (!phoneMap.has(rawPhone)) phoneMap.set(rawPhone, []);
          phoneMap.get(rawPhone)!.push({ itemName, amount: val });
        }
      } else {
        // 未知項目：名前でトラッキング
        unknownNames.set(itemName, Math.max(unknownNames.get(itemName) ?? 0, val));
      }
    }

    tenantOverage.set(tenantId, (tenantOverage.get(tenantId) ?? 0) + overageSum);
  }

  // 未知項目が見つかり、かつ分類が未提供 → フロントに返して分類を要求
  const unknownItems: UnknownItem[] = Array.from(unknownNames.entries()).map(([itemName, maxAmount]) => ({
    itemName,
    maxAmount,
  }));
  if (unknownItems.length > 0 && !newItemClassifications) {
    return { success: 0, unmatched: [], errors: [], requiresClassification: true, unknownItems };
  }

  // 継続取込=true の新規項目を DB に保存
  if (newItemClassifications) {
    const now2 = new Date().toISOString();
    for (const cls of newItemClassifications) {
      if (!cls.continuousImport) continue;
      try {
        await db.insert(mobileBillingItems).values({
          id: randomUUID(),
          itemName: cls.itemName,
          isBillable: cls.isBillable,
          continuousImport: true,
          createdAt: now2,
          updatedAt: now2,
        });
      } catch {
        // 既存レコードは無視
      }
    }
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

  await logActivity({
    actionType: "import",
    message: `SoftBank ${isCSV ? "CSV" : "Excel"}インポート完了: 成功${success}社、未照合${unmatched.size}件`,
    afterJson: { success, unmatched: Array.from(unmatched), yearMonth },
  });

  return { success, unmatched: Array.from(unmatched), errors: [] };
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
      const classificationsJson = formData.get("newItemClassifications") as string | null;
      const classifications = classificationsJson ? (JSON.parse(classificationsJson) as ClassifiedItem[]) : undefined;
      result.softBank = await importSoftBank(buffer, yearMonth, isCSV, classifications);
    }

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Import error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}