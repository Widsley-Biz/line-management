import "server-only";
import { db } from "@/lib/db";
import { ipNumbers, ipImportFiles, ipUsageDetails } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";
import {
  classifyCallType,
  computeAmount,
  ensureIpUsage,
  getTariffForTenant,
  normalizePhoneNumber,
  normalizeYearMonth,
  recalcIpUsage,
  type CallCategory,
  type Tariff,
} from "@/lib/ip-billing";

// CDR CSV 列インデックス（0始まり / A〜O の15列）
const COL = {
  billingAccount: 0, // A: 請求アカウント
  billingMonth: 2,   // C: 請求月
  usageMonth: 3,     // D: 利用月
  phoneNumber: 5,    // F: ご利用番号
  callTypeName: 7,   // H: 通話種別名称
  seconds: 13,       // N: 通話時間（秒）
  amount: 14,        // O: 通話料金
} as const;

export function parseCsvLine(line: string): string[] {
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

/**
 * CDRはShift-JIS前提で復号する。
 * ただしUTF-8として完全に妥当なバイト列（置換文字なし）はUTF-8として扱う
 * （Shift-JISファイルをUTF-8で読むと必ず置換文字が発生するため誤判定しない）。
 */
export function decodeCdrBuffer(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("shift_jis").decode(buffer);
}

export type UnmatchedNumber = {
  phoneNumber: string;
  rowCount: number;
  totalSeconds: number;
};

export type CdrFileResult = {
  fileName: string;
  status: "imported" | "skipped" | "error";
  message?: string;
  yearMonth?: string;
  billingAccount?: string;
  rowCount?: number;
  importedRows?: number;
  tenantCount?: number;
  unmatchedNumbers?: UnmatchedNumber[];
  unknownCallTypes?: string[];
};

/**
 * CDRファイル1件を取り込む。
 * - 同一内容（ハッシュ一致）はスキップ
 * - 明細は差分として追記し、対象の取引先×利用月を再集計する
 */
export async function importCdrFile(
  buffer: ArrayBuffer,
  fileName: string
): Promise<CdrFileResult> {
  const fileHash = createHash("sha256")
    .update(Buffer.from(buffer))
    .digest("hex");

  // まったく同じファイルはスキップ（ハッシュ一致）
  const [dup] = await db
    .select({ id: ipImportFiles.id, importedAt: ipImportFiles.importedAt })
    .from(ipImportFiles)
    .where(eq(ipImportFiles.fileHash, fileHash))
    .limit(1);
  if (dup) {
    return {
      fileName,
      status: "skipped",
      message: `同一内容のファイルが取込済みのためスキップしました（取込日時: ${dup.importedAt}）`,
    };
  }

  const text = decodeCdrBuffer(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { fileName, status: "error", message: "データ行がありません" };
  }

  // 番号マスタ（表番号・裏番号）を正規化してロード
  const numberRows = await db
    .select({
      tenantId: ipNumbers.tenantId,
      phoneNumber: ipNumbers.phoneNumber,
      subNumber: ipNumbers.subNumber,
    })
    .from(ipNumbers);

  const mainNumberMap = new Map<string, string>(); // 表番号 → tenantId
  const subNumberMap = new Map<string, string>();  // 裏番号 → tenantId
  for (const row of numberRows) {
    mainNumberMap.set(normalizePhoneNumber(row.phoneNumber), row.tenantId);
    if (row.subNumber) {
      subNumberMap.set(normalizePhoneNumber(row.subNumber), row.tenantId);
    }
  }

  // タリフは取引先単位でキャッシュ
  const tariffCache = new Map<string, Tariff>();
  async function tariffOf(tenantId: string): Promise<Tariff> {
    const cached = tariffCache.get(tenantId);
    if (cached) return cached;
    const t = await getTariffForTenant(tenantId);
    tariffCache.set(tenantId, t);
    return t;
  }

  // 集計: tenantId × yearMonth × 番号 × カテゴリ × 通話種別名称
  type AggValue = {
    tenantId: string;
    yearMonth: string;
    phoneNumber: string;
    category: CallCategory;
    callTypeName: string;
    totalSeconds: number;
    sourceAmount: number;
  };
  const agg = new Map<string, AggValue>();
  const unmatchedMap = new Map<string, UnmatchedNumber>();
  const unknownCallTypes = new Set<string>();
  let billingAccount = "";
  let fileYearMonth = "";
  let importedRows = 0;
  let rowCount = 0;

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    if (cols.length < 15) continue;
    rowCount++;

    if (!billingAccount) billingAccount = cols[COL.billingAccount]?.trim() ?? "";
    const yearMonth = normalizeYearMonth(cols[COL.usageMonth]?.trim() ?? "");
    if (!yearMonth) continue;
    if (!fileYearMonth) fileYearMonth = yearMonth;

    const rawNumber = cols[COL.phoneNumber]?.trim() ?? "";
    const normalized = normalizePhoneNumber(rawNumber);
    const callTypeName = cols[COL.callTypeName]?.trim() ?? "";
    const seconds = parseInt(cols[COL.seconds]?.trim() ?? "0", 10) || 0;
    const amount = parseFloat(cols[COL.amount]?.trim() ?? "0") || 0;

    const category = classifyCallType(callTypeName);
    if (!category) {
      if (callTypeName) unknownCallTypes.add(callTypeName);
      continue;
    }

    // 表番号 → 裏番号 の順で名寄せ
    const tenantId =
      mainNumberMap.get(normalized) ?? subNumberMap.get(normalized);
    if (!tenantId) {
      const entry = unmatchedMap.get(normalized) ?? {
        phoneNumber: rawNumber,
        rowCount: 0,
        totalSeconds: 0,
      };
      entry.rowCount++;
      entry.totalSeconds += seconds;
      unmatchedMap.set(normalized, entry);
      continue;
    }

    const key = `${tenantId} ${yearMonth} ${normalized} ${category} ${callTypeName}`;
    const entry = agg.get(key) ?? {
      tenantId,
      yearMonth,
      phoneNumber: normalized,
      category,
      callTypeName,
      totalSeconds: 0,
      sourceAmount: 0,
    };
    entry.totalSeconds += seconds;
    entry.sourceAmount += amount;
    agg.set(key, entry);
    importedRows++;
  }

  // 明細を差分として追記し、対象の取引先×利用月を再集計
  const now = new Date().toISOString();
  const affected = new Set<string>(); // tenantId × yearMonth
  const usageIdCache = new Map<string, string>();

  for (const entry of agg.values()) {
    const tariff = await tariffOf(entry.tenantId);
    const usageKey = `${entry.tenantId} ${entry.yearMonth}`;
    let usageId = usageIdCache.get(usageKey);
    if (!usageId) {
      usageId = await ensureIpUsage(entry.tenantId, entry.yearMonth);
      usageIdCache.set(usageKey, usageId);
    }

    await db.insert(ipUsageDetails).values({
      id: randomUUID(),
      ipUsageId: usageId,
      tenantId: entry.tenantId,
      phoneNumber: entry.phoneNumber,
      callCategory: entry.category,
      callTypeName: entry.callTypeName,
      totalSeconds: entry.totalSeconds,
      sourceAmount: entry.sourceAmount,
      computedAmount: computeAmount(
        entry.category,
        entry.totalSeconds,
        entry.sourceAmount,
        tariff
      ),
      yearMonth: entry.yearMonth,
      createdAt: now,
    });
    affected.add(usageKey);
  }

  for (const key of affected) {
    const [tenantId, yearMonth] = key.split(" ");
    await recalcIpUsage(tenantId, yearMonth);
  }

  // 取込履歴（重複判定用ハッシュ）を保存
  await db.insert(ipImportFiles).values({
    id: randomUUID(),
    fileName,
    fileHash,
    billingAccount: billingAccount || null,
    yearMonth: fileYearMonth || null,
    rowCount,
    importedAt: now,
  });

  return {
    fileName,
    status: "imported",
    yearMonth: fileYearMonth,
    billingAccount,
    rowCount,
    importedRows,
    tenantCount: affected.size,
    unmatchedNumbers: Array.from(unmatchedMap.values()),
    unknownCallTypes: Array.from(unknownCallTypes),
  };
}
