import "server-only";
import { db } from "@/lib/db";
import {
  ipNumbers,
  ipImportFiles,
  ipImportUnmatched,
  ipMasterUnmatched,
  ipUsageDetails,
} from "@/lib/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { decodeCsvBuffer } from "@/lib/csv";
import { runInTransaction } from "@/lib/db/tx";
import { forEachCdrLine, scanCdrBytes } from "@/lib/cdr-lines";
import { attachUnmatchedRows, type UnmatchedRowRef } from "@/lib/cdr-unmatched-rows";
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
  /** この番号の未照合レコード（ip_import_unmatched）のID・利用月。取込結果画面からの割当に使う */
  rows?: UnmatchedRowRef[];
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
  /** 取込対象外にした通話種別ごとの行数・秒数・金額（請求に反映されていない分） */
  unknownCallTypeSummary?: { name: string; rowCount: number; seconds: number; amount: number }[];
  /** 取込対象外にした行の内訳 */
  skippedRows?: { shortRows: number; noUsageMonthRows: number; unknownTypeRows: number };
  /** 突き合わせ済みの合計（全データ行数・取込対象行の秒数と金額） */
  verified?: { dataLines: number; seconds: number; amount: number };
  /** 画面に出す注意（取込対象外にした行がある場合） */
  warnings?: string[];
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

    // 番号マスタ未照合に同じ番号の行があれば、その情報を引き継いで登録する。
    // CDRに出てくる番号は裏番号（フリーダイヤル）のこともあるため、表番号・裏番号の
    // どちらとの一致も見る。引き継がないと裏番号が登録されず、裏番号あての通話が
    // 次回以降も未紐付けになり請求から漏れる。
    const masterCandidates = await db
      .select({
        id: ipMasterUnmatched.id,
        phoneNumber: ipMasterUnmatched.phoneNumber,
        subNumber: ipMasterUnmatched.subNumber,
        notes: ipMasterUnmatched.notes,
      })
      .from(ipMasterUnmatched)
      .where(ne(ipMasterUnmatched.status, "resolved"));
    const masterRow = masterCandidates.find(
      (m) =>
        phoneMatchKey(m.phoneNumber) === targetKey ||
        (m.subNumber ? phoneMatchKey(m.subNumber) === targetKey : false)
    );

    if (!existingNumber) {
      // マスタ未照合の行があればその表番号・裏番号で登録する（CDRの番号が裏番号でも
      // 表番号を主として登録できる）。無ければCDRの番号をそのまま表番号として登録する。
      const alreadyRegistered =
        masterRow &&
        allNumbers.some((n) => phoneMatchKey(n.phoneNumber) === phoneMatchKey(masterRow.phoneNumber));
      if (!alreadyRegistered) {
        await db.insert(ipNumbers).values({
          id: randomUUID(),
          tenantId,
          phoneNumber: masterRow?.phoneNumber ?? row.phoneNumber,
          subNumber: masterRow?.subNumber ?? null,
          status: "契約中",
          notes: masterRow?.notes ?? "未照合一覧から割当",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // 引き継いだ番号マスタ未照合の行は処理済みにする（同じ番号の割当をもう一度
    // 求められて「既に登録済み」エラーになるのを防ぐ）
    if (masterRow) {
      await db
        .update(ipMasterUnmatched)
        .set({ status: "resolved", resolvedTenantId: tenantId, updatedAt: now })
        .where(eq(ipMasterUnmatched.id, masterRow.id));
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

/** 金額の突き合わせ許容誤差（浮動小数の加算順序の違いだけを許す） */
function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}

const VERIFY_CHUNK = 500;

/**
 * CDRファイル1件を取り込む。
 * - 同一内容（ハッシュ一致）はスキップ
 * - 明細は差分として追記し、対象の取引先×利用月を再集計する
 *
 * ファイルは全文をメモリに載せず、チャンク単位で1行ずつ集計する（src/lib/cdr-lines.ts）。
 * 集計結果（取引先×利用月×番号×種別の合計）だけをメモリに持ち、最後に1トランザクションで書き込む。
 * 途中で失敗した場合は何も書かず、取込履歴（ハッシュ）も残らないため、やり直しても二重計上にならない。
 *
 * 取りこぼし防止のため、次の突き合わせを必ず行い、1つでも合わなければ取込全体を中止する（書き込みなし）。
 *  1. 行数: 全データ行 = 列数不足の行 + 15列以上の行、15列以上の行 = 取込 + 未紐付け + 利用月なし + 未対応種別
 *  2. 秒数・金額: ファイルから読んだ対象行の合計 = 取込分の集計 + 未紐付けの集計
 *  3. 書き込み後に読み戻し: DBに入った明細・未紐付けの合計が、書き込もうとした内容と一致
 * 取込対象外にした行（列数不足・利用月なし・未対応の通話種別）は件数と金額を結果に返す。
 */
export async function importCdrFile(
  buffer: ArrayBuffer,
  fileName: string
): Promise<CdrFileResult> {
  const bytes = new Uint8Array(buffer);

  // 1回目の走査: ハッシュ（展開後の内容で計算するため、圧縮の有無にかかわらず
  // 同一ファイルは重複としてスキップされる）と文字コードを決める
  const { fileHash, encoding } = await scanCdrBytes(bytes);

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
  const unknownSummary = new Map<string, { rowCount: number; seconds: number; amount: number }>();
  let billingAccount = "";
  let fileYearMonth = "";
  let importedRows = 0;
  let rowCount = 0;

  // 突き合わせ用の計数（集計とは別系統で、読んだ行をそのまま数える）
  let shortRows = 0;       // 15列未満（取込対象外）
  let noUsageMonthRows = 0; // 利用月が読めない（取込対象外）
  let unknownTypeRows = 0;  // 未対応の通話種別（取込対象外）
  let unmatchedRows = 0;    // 番号マスタに無い（未紐付けとして保存）
  let inSeconds = 0;        // 取込分＋未紐付けとして扱う行の秒数合計
  let inAmount = 0;         // 同・金額合計
  let noUsageMonthAmount = 0; // 利用月が読めない行の金額合計（通知用）

  // 2回目の走査: 1行ずつ集計する
  const { nonBlankLines } = await forEachCdrLine(bytes, encoding, (line, isHeader) => {
    if (isHeader) return;
    const cols = parseCsvLine(line);
    if (cols.length < 15) {
      shortRows++;
      return;
    }
    rowCount++;

    if (!billingAccount) billingAccount = cols[COL.billingAccount]?.trim() ?? "";
    const yearMonth = normalizeYearMonth(cols[COL.usageMonth]?.trim() ?? "");
    const amount = parseFloat(cols[COL.amount]?.trim() ?? "0") || 0;
    if (!yearMonth) {
      noUsageMonthRows++;
      noUsageMonthAmount += amount;
      return;
    }
    if (!fileYearMonth) fileYearMonth = yearMonth;

    const rawNumber = cols[COL.phoneNumber]?.trim() ?? "";
    const normalized = normalizePhoneNumber(rawNumber);
    const callTypeName = cols[COL.callTypeName]?.trim() ?? "";
    const seconds = parseInt(cols[COL.seconds]?.trim() ?? "0", 10) || 0;

    const category = classifyCallType(callTypeName);
    if (!category) {
      unknownTypeRows++;
      if (callTypeName) unknownCallTypes.add(callTypeName);
      const u = unknownSummary.get(callTypeName) ?? { rowCount: 0, seconds: 0, amount: 0 };
      u.rowCount++;
      u.seconds += seconds;
      u.amount += amount;
      unknownSummary.set(callTypeName, u);
      return;
    }

    inSeconds += seconds;
    inAmount += amount;

    // 表番号 → 裏番号 の順で名寄せ（ハイフン・先頭0の有無を無視して照合）
    const matchKey = phoneMatchKey(normalized);
    const tenantId =
      mainNumberMap.get(matchKey) ?? subNumberMap.get(matchKey);
    if (!tenantId) {
      unmatchedRows++;
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
      return;
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
  });

  if (nonBlankLines < 2) {
    return { fileName, status: "error", message: "データ行がありません" };
  }
  const dataLines = nonBlankLines - 1;

  // 突き合わせ1: 行数
  if (dataLines !== shortRows + rowCount) {
    throw new Error(
      `取込を中止しました（行数の突き合わせが合いません: データ行${dataLines} ≠ 列数不足${shortRows} + 15列以上${rowCount}）。何も保存していません`
    );
  }
  if (rowCount !== importedRows + unmatchedRows + noUsageMonthRows + unknownTypeRows) {
    throw new Error(
      `取込を中止しました（行数の突き合わせが合いません: 15列以上${rowCount} ≠ 取込${importedRows} + 未紐付け${unmatchedRows} + 利用月なし${noUsageMonthRows} + 未対応種別${unknownTypeRows}）。何も保存していません`
    );
  }
  // 突き合わせ2: 秒数・金額（ファイルから読んだ合計 = 保存しようとしている集計の合計）
  let aggSeconds = 0;
  let aggAmount = 0;
  for (const e of agg.values()) {
    aggSeconds += e.totalSeconds;
    aggAmount += e.sourceAmount;
  }
  for (const u of unmatchedAggMap.values()) {
    for (const item of Object.values(u.items)) {
      aggSeconds += item.seconds;
      aggAmount += item.amount;
    }
  }
  if (aggSeconds !== inSeconds || !sameAmount(aggAmount, inAmount)) {
    throw new Error(
      `取込を中止しました（秒数・金額の突き合わせが合いません: ファイル ${inSeconds}秒/${inAmount} ≠ 集計 ${aggSeconds}秒/${aggAmount}）。何も保存していません`
    );
  }

  // 明細を差分として追記し、対象の取引先×利用月を再集計
  const now = new Date().toISOString();
  const affected = new Set<string>(); // tenantId × yearMonth
  const usageIdCache = new Map<string, string>();

  // 突き合わせ3（読み戻し）用: 書き込んだ内容の控え
  const insertedDetailIds: string[] = [];
  let writtenDetailSeconds = 0;
  let writtenDetailAmount = 0;
  const writtenUnmatched: {
    id: string;
    phoneNumber: string;
    yearMonth: string;
    itemsJson: string;
    totalSeconds: number;
  }[] = [];

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

      const detailId = randomUUID();
      await db.insert(ipUsageDetails).values({
        id: detailId,
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
      insertedDetailIds.push(detailId);
      writtenDetailSeconds += entry.totalSeconds;
      writtenDetailAmount += entry.sourceAmount;
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
        const itemsJson = JSON.stringify(merged);
        const totalSeconds = existing.totalSeconds + uAgg.totalSeconds;
        await db
          .update(ipImportUnmatched)
          .set({
            itemsJson,
            totalSeconds,
            importedAt: now,
            updatedAt: now,
          })
          .where(eq(ipImportUnmatched.id, existing.id));
        writtenUnmatched.push({
          id: existing.id,
          phoneNumber: uAgg.phoneNumber,
          yearMonth: uAgg.yearMonth,
          itemsJson,
          totalSeconds,
        });
      } else {
        const id = randomUUID();
        const itemsJson = JSON.stringify(uAgg.items);
        await db.insert(ipImportUnmatched).values({
          id,
          yearMonth: uAgg.yearMonth,
          phoneNumber: uAgg.phoneNumber,
          itemsJson,
          totalSeconds: uAgg.totalSeconds,
          status: "pending",
          importedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        writtenUnmatched.push({
          id,
          phoneNumber: uAgg.phoneNumber,
          yearMonth: uAgg.yearMonth,
          itemsJson,
          totalSeconds: uAgg.totalSeconds,
        });
      }
    }

    // 突き合わせ3: 読み戻し。ここで合わなければ例外 → ROLLBACK（何も残らない）
    let storedSeconds = 0;
    let storedAmount = 0;
    for (let i = 0; i < insertedDetailIds.length; i += VERIFY_CHUNK) {
      const [sum] = await db
        .select({
          n: sql<number>`count(*)`,
          seconds: sql<number>`coalesce(sum(${ipUsageDetails.totalSeconds}), 0)`,
          amount: sql<number>`coalesce(sum(${ipUsageDetails.sourceAmount}), 0)`,
        })
        .from(ipUsageDetails)
        .where(inArray(ipUsageDetails.id, insertedDetailIds.slice(i, i + VERIFY_CHUNK)));
      if (Number(sum.n) !== insertedDetailIds.slice(i, i + VERIFY_CHUNK).length) {
        throw new Error("取込を中止しました（保存後の読み戻しで明細の件数が合いません）。何も保存していません");
      }
      storedSeconds += Number(sum.seconds);
      storedAmount += Number(sum.amount);
    }
    if (storedSeconds !== writtenDetailSeconds || !sameAmount(storedAmount, writtenDetailAmount)) {
      throw new Error(
        `取込を中止しました（保存後の読み戻しで明細の合計が合いません: 保存 ${storedSeconds}秒/${storedAmount} ≠ 書込 ${writtenDetailSeconds}秒/${writtenDetailAmount}）。何も保存していません`
      );
    }
    for (let i = 0; i < writtenUnmatched.length; i += VERIFY_CHUNK) {
      const part = writtenUnmatched.slice(i, i + VERIFY_CHUNK);
      const rows = await db
        .select({
          id: ipImportUnmatched.id,
          itemsJson: ipImportUnmatched.itemsJson,
          totalSeconds: ipImportUnmatched.totalSeconds,
        })
        .from(ipImportUnmatched)
        .where(inArray(ipImportUnmatched.id, part.map((p) => p.id)));
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const p of part) {
        const r = byId.get(p.id);
        if (!r || r.itemsJson !== p.itemsJson || r.totalSeconds !== p.totalSeconds) {
          throw new Error("取込を中止しました（保存後の読み戻しで未紐付けの内容が合いません）。何も保存していません");
        }
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

  // 取込対象外にした行は、黙って捨てずに結果へ出す（請求漏れの見落とし防止）
  const warnings: string[] = [];
  if (shortRows > 0) {
    warnings.push(`列数が15未満で取り込めなかった行が${shortRows}行あります（ファイルの破損や途中切れの可能性があります）`);
  }
  if (noUsageMonthRows > 0) {
    warnings.push(`利用月が読み取れず取り込めなかった行が${noUsageMonthRows}行あります（金額合計 ${noUsageMonthAmount.toLocaleString("ja-JP")}円）`);
  }
  const unknownCallTypeSummary = Array.from(unknownSummary.entries()).map(
    ([name, v]) => ({ name, rowCount: v.rowCount, seconds: v.seconds, amount: v.amount })
  );
  for (const u of unknownCallTypeSummary) {
    if (u.amount !== 0) {
      warnings.push(`未対応の通話種別「${u.name || "（空欄）"}」が${u.rowCount}行・金額${u.amount.toLocaleString("ja-JP")}円あり、請求に反映されていません`);
    }
  }

  return {
    fileName,
    status: "imported",
    yearMonth: fileYearMonth,
    billingAccount,
    rowCount,
    importedRows,
    tenantCount: affected.size,
    unmatchedNumbers: attachUnmatchedRows(unmatchedMap, writtenUnmatched),
    unknownCallTypes: Array.from(unknownCallTypes),
    unknownCallTypeSummary,
    skippedRows: { shortRows, noUsageMonthRows, unknownTypeRows },
    verified: { dataLines, seconds: inSeconds, amount: inAmount },
    warnings,
  };
}
