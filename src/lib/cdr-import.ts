import "server-only";
import { db } from "@/lib/db";
import {
  ipNumbers,
  ipImportFiles,
  ipImportUnmatched,
  ipUsageDetails,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";
import { decodeCsvBuffer } from "@/lib/csv";
import { runInTransaction } from "@/lib/db/tx";
import { gunzipIfNeeded } from "@/lib/gzip";
import { formatJstDateTime } from "@/lib/format";
import {
  classifyCallType,
  computeAmount,
  ensureIpUsage,
  getTariffForTenant,
  normalizePhoneNumber,
  normalizeYearMonth,
  phoneMatchKey,
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

/** CDRの復号は共通のCSV文字コード自動判定に委譲する（UTF-8 / Shift-JIS） */
export function decodeCdrBuffer(buffer: ArrayBuffer): string {
  return decodeCsvBuffer(buffer);
}

export type UnmatchedNumber = {
  phoneNumber: string;
  rowCount: number;
  totalSeconds: number;
};

/** 未紐付け番号の通話種別内訳（ip_import_unmatched.items_json の形） */
export type UnmatchedItems = Record<
  string, // 通話種別名称
  { category: CallCategory; seconds: number; amount: number }
>;

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
 * 未照合番号を取引先に割り当てる。
 * - 番号マスタ未登録なら表番号として登録（次回以降の取込で自動名寄せされる）
 * - 保存済みの内訳をタリフ計算して明細に反映し、再集計する
 */
export async function assignUnmatchedToTenant(
  id: string,
  tenantId: string
): Promise<{ ok: boolean; error?: string; usageId?: string }> {
  const [row] = await db
    .select()
    .from(ipImportUnmatched)
    .where(eq(ipImportUnmatched.id, id));
  if (!row) return { ok: false, error: "対象の未照合レコードが見つかりません" };
  if (row.status === "resolved") {
    return {
      ok: false,
      error:
        "この未照合レコードは既に処理済みです。二重計上を防ぐため中止しました。画面を再読み込みしてください。",
    };
  }

  let items: UnmatchedItems;
  try {
    items = JSON.parse(row.itemsJson) as UnmatchedItems;
  } catch {
    items = {};
  }

  const now = new Date().toISOString();
  let usageId = "";

  // 明細挿入・再集計・状態更新は1トランザクションにまとめる。
  // 途中で失敗すると明細だけが残り、再実行すると同じ明細が二重に入るため。
  await runInTransaction(async () => {
    // 処理済みかどうかはトランザクション内で再確認する（二重送信の防止）。
    // トランザクションは直列化されるため、ここで resolved なら先の処理が完了している。
    const [current] = await db
      .select({ status: ipImportUnmatched.status })
      .from(ipImportUnmatched)
      .where(eq(ipImportUnmatched.id, id));
    if (!current || current.status === "resolved") {
      throw new Error("この未照合レコードは既に処理済みです（二重計上を防ぐため中止しました）");
    }

    // ハイフン・先頭0の有無を無視して既存登録の有無を確認する
    const allNumbers = await db
      .select({ id: ipNumbers.id, phoneNumber: ipNumbers.phoneNumber })
      .from(ipNumbers);
    const targetKey = phoneMatchKey(row.phoneNumber);
    const existingNumber = allNumbers.find((n) => phoneMatchKey(n.phoneNumber) === targetKey);
    if (!existingNumber) {
      await db.insert(ipNumbers).values({
        id: randomUUID(),
        tenantId,
        phoneNumber: row.phoneNumber,
        status: "契約中",
        notes: "未照合一覧から割当",
        createdAt: now,
        updatedAt: now,
      });
    }

    const tariff = await getTariffForTenant(tenantId);
    usageId = await ensureIpUsage(tenantId, row.yearMonth);

    for (const [callTypeName, item] of Object.entries(items)) {
      await db.insert(ipUsageDetails).values({
        id: randomUUID(),
        ipUsageId: usageId,
        tenantId,
        phoneNumber: row.phoneNumber,
        callCategory: item.category,
        callTypeName,
        totalSeconds: item.seconds,
        sourceAmount: item.amount,
        computedAmount: computeAmount(item.category, item.seconds, item.amount, tariff),
        yearMonth: row.yearMonth,
        createdAt: now,
      });
    }
    await recalcIpUsage(tenantId, row.yearMonth);

    await db
      .update(ipImportUnmatched)
      .set({ status: "resolved", resolvedTenantId: tenantId, updatedAt: now })
      .where(eq(ipImportUnmatched.id, id));
  });

  return { ok: true, usageId };
}

/**
 * CDRファイル1件を取り込む。
 * - 同一内容（ハッシュ一致）はスキップ
 * - 明細は差分として追記し、対象の取引先×利用月を再集計する
 */
export async function importCdrFile(
  buffer: ArrayBuffer,
  fileName: string
): Promise<CdrFileResult> {
  // 画面側で圧縮されている場合は展開する。
  // ハッシュは展開後の内容で計算するため、圧縮の有無にかかわらず
  // 同一ファイルは重複としてスキップされる。
  const content = gunzipIfNeeded(buffer);

  const fileHash = createHash("sha256")
    .update(Buffer.from(content))
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
      message: `同一内容のファイルが取込済みのためスキップしました（取込日時: ${formatJstDateTime(dup.importedAt)}）`,
    };
  }

  const text = decodeCdrBuffer(content);
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
    mainNumberMap.set(phoneMatchKey(row.phoneNumber), row.tenantId);
    if (row.subNumber) {
      subNumberMap.set(phoneMatchKey(row.subNumber), row.tenantId);
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
  // 未紐付け番号の内訳（number×yearMonth → 通話種別ごとの秒数・金額）
  type UnmatchedAgg = { phoneNumber: string; yearMonth: string; items: UnmatchedItems; totalSeconds: number };
  const unmatchedAggMap = new Map<string, UnmatchedAgg>();
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

    // 表番号 → 裏番号 の順で名寄せ（ハイフン・先頭0の有無を無視して照合）
    const matchKey = phoneMatchKey(normalized);
    const tenantId =
      mainNumberMap.get(matchKey) ?? subNumberMap.get(matchKey);
    if (!tenantId) {
      const entry = unmatchedMap.get(normalized) ?? {
        phoneNumber: rawNumber,
        rowCount: 0,
        totalSeconds: 0,
      };
      entry.rowCount++;
      entry.totalSeconds += seconds;
      unmatchedMap.set(normalized, entry);

      const aggKey = `${normalized} ${yearMonth}`;
      const uAgg = unmatchedAggMap.get(aggKey) ?? {
        phoneNumber: normalized,
        yearMonth,
        items: {} as UnmatchedItems,
        totalSeconds: 0,
      };
      const item = uAgg.items[callTypeName] ?? { category, seconds: 0, amount: 0 };
      item.seconds += seconds;
      item.amount += amount;
      uAgg.items[callTypeName] = item;
      uAgg.totalSeconds += seconds;
      unmatchedAggMap.set(aggKey, uAgg);
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

  // 以降の書き込みは1トランザクションにまとめる。
  // 個別コミットだとGCSマウント上のDBでは同期が数百回発生しタイムアウトする。
  await runInTransaction(async () => {
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

    // 未紐付け番号を保存（同一番号×利用月のpending行があれば内訳を加算マージ）
    for (const uAgg of unmatchedAggMap.values()) {
      const [existing] = await db
        .select()
        .from(ipImportUnmatched)
        .where(
          and(
            eq(ipImportUnmatched.phoneNumber, uAgg.phoneNumber),
            eq(ipImportUnmatched.yearMonth, uAgg.yearMonth),
            eq(ipImportUnmatched.status, "pending")
          )
        )
        .limit(1);

      if (existing) {
        let merged: UnmatchedItems;
        try {
          merged = JSON.parse(existing.itemsJson) as UnmatchedItems;
        } catch {
          merged = {};
        }
        for (const [name, item] of Object.entries(uAgg.items)) {
          const prev = merged[name] ?? { category: item.category, seconds: 0, amount: 0 };
          prev.seconds += item.seconds;
          prev.amount += item.amount;
          merged[name] = prev;
        }
        await db
          .update(ipImportUnmatched)
          .set({
            itemsJson: JSON.stringify(merged),
            totalSeconds: existing.totalSeconds + uAgg.totalSeconds,
            importedAt: now,
            updatedAt: now,
          })
          .where(eq(ipImportUnmatched.id, existing.id));
      } else {
        await db.insert(ipImportUnmatched).values({
          id: randomUUID(),
          yearMonth: uAgg.yearMonth,
          phoneNumber: uAgg.phoneNumber,
          itemsJson: JSON.stringify(uAgg.items),
          totalSeconds: uAgg.totalSeconds,
          status: "pending",
          importedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
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
