import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  callLogs,
  tenants,
  phoneNumbers,
  mobileLines,
  mobileUsages,
  mobileUsageDetails,
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
  isCSV: boolean
): Promise<ImportResult> {
  const OVERAGE_COLUMNS = [12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 36, 55, 56, 57, 58];
  const OVERAGE_ITEM_NAMES = [
    "通話料　通話定額基本料　対象外通話",
    "通信料　メール（SMS）",
    "通信料　メール（SMS）（他社宛）",
    "通話料　国際電話",
    "通話料　国際電話",
    "通話料　世界対応ケータイ（音声）（日本国内事業者宛）",
    "通信料　世界対応ケータイ（SMS）（日本国内事業者宛）",
    "通話料　ドコモ衛星電話宛",
    "通信料　メール（SMS）",
    "通信料　メール（SMS）（他社宛）",
    "その他　オートチャージ（快適モード）追加データ１ＧＢ",
    "代行分　SoftBank・ワイモバイルまとめて支払い（Google Play）ご利用分",
    "情報料　SoftBank・ワイモバイルまとめて支払い（デジタルコンテンツ等）ご利用分",
    "情報料　SoftBank・ワイモバイルまとめて支払い（Apple等）ご利用分",
    "通話料　通信サービス「0570等」",
  ];

  const lineRows = await db
    .select({ phoneNumber: mobileLines.phoneNumber, tenantId: mobileLines.tenantId })
    .from(mobileLines)
    .where(eq(mobileLines.status, "契約中"));

  const phoneToTenant = new Map<string, string>();
  for (const row of lineRows) {
    // ハイフンあり・なし両対応
    phoneToTenant.set(row.phoneNumber, row.tenantId);
    phoneToTenant.set(row.phoneNumber.replace(/-/g, ""), row.tenantId);
  }

  const tenantOverage = new Map<string, number>();
  const tenantLines = new Map<string, Set<string>>();
  const unmatched = new Set<string>();
  const errors: string[] = [];
  const detailMap = new Map<string, Map<string, Array<{ itemName: string; amount: number }>>>();

  // 1行分のデータを処理する共通関数
  // values は 1始まりのインデックスを想定（ExcelJS準拠）
  const processRow = (values: (string | number | null | undefined)[]) => {
    const rawPhone = String(values[3] ?? "").trim();
    if (!rawPhone) return;

    const tenantId =
      phoneToTenant.get(rawPhone) ?? phoneToTenant.get(rawPhone.replace(/-/g, ""));
    if (!tenantId) {
      unmatched.add(rawPhone);
      return;
    }

    let overageSum = 0;
    for (let i = 0; i < OVERAGE_COLUMNS.length; i++) {
      const raw = values[OVERAGE_COLUMNS[i]];
      const val = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0")) || 0;
      if (val > 0) {
        overageSum += val;
        if (!detailMap.has(tenantId)) detailMap.set(tenantId, new Map());
        const phoneMap = detailMap.get(tenantId)!;
        if (!phoneMap.has(rawPhone)) phoneMap.set(rawPhone, []);
        phoneMap.get(rawPhone)!.push({ itemName: OVERAGE_ITEM_NAMES[i], amount: val });
      }
    }

    tenantOverage.set(tenantId, (tenantOverage.get(tenantId) ?? 0) + overageSum);
    if (!tenantLines.has(tenantId)) tenantLines.set(tenantId, new Set());
    tenantLines.get(tenantId)!.add(rawPhone);
  };

  if (isCSV) {
    // CSV処理：1行目ヘッダー、2行目税区分、3行目からデータ
    const text = new TextDecoder("utf-8").decode(buffer);
    const lines = text.split("\n").filter((l) => l.trim());
    for (const line of lines.slice(2)) {
      const cols = parseCsvLine(line);
      // ExcelJSのrow.valuesは1始まりなので先頭にnullを挿入して合わせる
      processRow([null, ...cols]);
    }
  } else {
    // Excel処理
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const ws = workbook.getWorksheet("ご利用分析サービス");
    if (!ws) return { success: 0, unmatched: [], errors: ["シートが見つかりません"] };
    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return;
      processRow(row.values as (string | number | null | undefined)[]);
    });
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

  return { success, unmatched: Array.from(unmatched), errors };
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
      result.softBank = await importSoftBank(buffer, yearMonth, isCSV);
    }

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Import error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}