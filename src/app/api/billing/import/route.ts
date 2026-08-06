import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  tenants,
  mobileUsages,
  mobileUsageDetails,
  mobileBillingItems,
  mobileImportUnmatched,
} from "@/lib/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";
import { decodeCsvBuffer } from "@/lib/csv";
import { runInTransaction } from "@/lib/db/tx";
import { gunzipIfNeeded } from "@/lib/gzip";

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

  type ItemEntry = { isBillable: boolean };
  const itemMap = new Map<string, ItemEntry>(
    dbItems.map((i) => [i.itemName, { isBillable: i.isBillable }])
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
    // SoftBankのCSV出力はShift-JIS(CP932)の場合があるため文字コードを自動判定する
    // （UTF-8決め打ちだと日本語ヘッダが文字化けし、氏名列の検出が部署名列にずれる）
    const text = decodeCsvBuffer(buffer);
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length > 0) {
      headerRow = [null, ...parseCsvLine(lines[0])];
    }
    // ヘッダ以降は全行を対象にする。税区分行や小計行は氏名・電話番号が
    // 空のため後段の行処理でスキップされる（税区分行の有無に依存しない）
    for (const line of lines.slice(1)) {
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

  // ヘッダ行から氏名・電話番号の列インデックスを動的検出
  let nameColIdx = 2; // デフォルト col B
  let phoneColIdx = 3; // デフォルト col C
  const nameKeywords = ["氏名", "利用者", "契約者", "お名前", "ご利用者", "名前"];
  const phoneKeywords = ["電話番号", "電話", "TEL", "tel", "携帯番号"];
  // 課金項目の開始列より手前のみ走査（「通話料　国際電話」等の課金項目名が
  // キーワードに誤一致して電話番号列と判定されるのを防ぐ）
  const billingStartIdx =
    colNameMap.size > 0 ? Math.min(...colNameMap.keys()) : 13;
  for (let i = 1; i < Math.min(13, billingStartIdx); i++) {
    const h = String(headerRow[i] ?? "").trim();
    if (h && nameKeywords.some((k) => h.includes(k))) nameColIdx = i;
    if (h && phoneKeywords.some((k) => h.includes(k))) phoneColIdx = i;
  }

  // 最初の実データ行（税区分行・小計行を除く）。未登録列の数値検出に使用
  const firstDataRow =
    dataRows.find((values) => {
      const n = String(values[nameColIdx] ?? "").trim();
      const p = String(values[phoneColIdx] ?? "").trim();
      return Boolean(n || p);
    }) ?? [];

  // プレビューモード：完全一致した課金項目と未登録項目を返すだけ（DB書込なし）
  if (previewOnly) {
    // isBillingHeader では検出できない未登録列（割引列・氏名型の個人別集計列等）を
    // 最初のデータ行の数値有無で補完検出する。
    // メタデータ列（ICCID 等）の誤検出を避けるため、既知課金列の最小インデックス以降のみ走査する。
    if (firstDataRow.length > 0 && colNameMap.size > 0) {
      const minBillingIdx = Math.min(...colNameMap.keys());
      for (let i = minBillingIdx; i < headerRow.length; i++) {
        const h = String(headerRow[i] ?? "").trim();
        if (!h || knownNames.has(h) || colNameMap.has(i) || unknownItems.includes(h)) continue;
        const raw = firstDataRow[i];
        const val = typeof raw === "number" ? raw : parseFloat(String(raw ?? "")) || 0;
        if (val !== 0) unknownItems.push(h);
      }
    }

    const billingItems: string[] = [];
    for (const [, itemName] of colNameMap) {
      if (itemMap.get(itemName)?.isBillable) billingItems.push(itemName);
    }
    return {
      success: 0,
      unmatched: [],
      errors: [],
      preview: {
        billingItems: [...new Set(billingItems)],
        unknownItems: [...new Set(unknownItems)],
      },
    };
  }

  // マスタ未登録項目がある場合はインポートを中止（マスタ登録後に再実行してもらう）
  if (unknownItems.length > 0) {
    const uniqueUnknown = [...new Set(unknownItems)];
    const errorMsg = `マスタ未登録の項目があるためインポートを中止しました。課金項目マスタで登録してから再実行してください: ${uniqueUnknown.join("、")}`;
    await logActivity({
      actionType: "import",
      message: `SoftBank ${isCSV ? "CSV" : "Excel"}インポート中止: マスタ未登録項目${uniqueUnknown.length}件`,
      afterJson: { unknownItems: uniqueUnknown, yearMonth },
    });
    return {
      success: 0,
      unmatched: [],
      errors: [errorMsg],
    };
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
        // マイナス金額（ご返金・調整）は超過金額から差し引くため対象に含める
        if (val === 0) continue;
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
      // マイナス金額（ご返金・調整）は超過金額から差し引くため対象に含める
      if (val === 0) continue;

      // colNameMap はマスタと完全一致した列のみ
      if (itemMap.get(itemName)?.isBillable) {
        overageSum += val;
        if (!detailMap.has(tenantId)) detailMap.set(tenantId, new Map());
        const phoneMap = detailMap.get(tenantId)!;
        if (!phoneMap.has(rawPhone)) phoneMap.set(rawPhone, []);
        const items = phoneMap.get(rawPhone)!;
        const existing = items.find((d) => d.itemName === itemName);
        if (existing) {
          existing.amount += val;
        } else {
          items.push({ itemName, amount: val });
        }
      }
    }

    tenantOverage.set(tenantId, (tenantOverage.get(tenantId) ?? 0) + overageSum);
  }

  const now = new Date().toISOString();
  let success = 0;

  // 以降の書き込みは1トランザクションにまとめる。
  // 個別コミットだとGCSマウント上のDBでは同期が数百回発生しタイムアウトする。
  await runInTransaction(async () => {
    for (const [tenantId, fileOverage] of tenantOverage.entries()) {
      const fileIdentifiers = tenantLines.get(tenantId) ?? new Set<string>();
      const phoneMap = detailMap.get(tenantId);

      const existing = await db
        .select({ id: mobileUsages.id, totalLines: mobileUsages.totalLines })
        .from(mobileUsages)
        .where(
          and(
            eq(mobileUsages.tenantId, tenantId),
            eq(mobileUsages.yearMonth, yearMonth)
          )
        )
        .then((rows) => rows[0] ?? null);

      let usageId: string;
      let oldPhones: Set<string> | null = null;

      if (existing) {
        usageId = existing.id;
        // 差分マージ: 今回ファイルに含まれる回線（電話番号）の明細だけ入れ替え、
        // 含まれない回線の既存明細は保持する（同一ファイルの再取込は冪等になる）
        const oldDetails = await db
          .select({ phoneNumber: mobileUsageDetails.phoneNumber })
          .from(mobileUsageDetails)
          .where(eq(mobileUsageDetails.mobileUsageId, usageId));
        oldPhones = new Set(oldDetails.map((d) => d.phoneNumber));

        const filePhones = phoneMap ? [...phoneMap.keys()] : [];
        if (filePhones.length > 0) {
          await db
            .delete(mobileUsageDetails)
            .where(
              and(
                eq(mobileUsageDetails.mobileUsageId, usageId),
                inArray(mobileUsageDetails.phoneNumber, filePhones)
              )
            );
        }
      } else {
        usageId = randomUUID();
        await db.insert(mobileUsages).values({
          id: usageId,
          tenantId,
          yearMonth,
          totalLines: fileIdentifiers.size,
          overageTotal: fileOverage,
          sfStatus: fileOverage > 0 ? "未送信" : "超過なし",
          importedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

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

      if (existing && oldPhones) {
        // マージ後の明細から超過合計を再計算
        const mergedOverage = await db
          .select({
            total: sql<number>`coalesce(sum(${mobileUsageDetails.amount}), 0)`,
          })
          .from(mobileUsageDetails)
          .where(eq(mobileUsageDetails.mobileUsageId, usageId))
          .then((rows) => rows[0]?.total ?? 0);
        // 回線数は既存分＋今回新たに現れた回線を加算
        // （超過ゼロで明細を持たない既存回線は識別できないため近似）
        const addedLines = [...fileIdentifiers].filter(
          (line) => !oldPhones.has(line)
        ).length;
        await db
          .update(mobileUsages)
          .set({
            overageTotal: mergedOverage,
            totalLines: existing.totalLines + addedLines,
            sfStatus: mergedOverage > 0 ? "未送信" : "超過なし",
            importedAt: now,
            updatedAt: now,
          })
          .where(eq(mobileUsages.id, usageId));
      }

      success++;
    }

    // 未照合行を DB に保存（今回ファイルに現れた氏名の pending のみ入れ替え、
    // 他の pending・resolved/ignored は保持する）
    if (unmatchedMap.size > 0) {
      const pendingIds = await db
        .select({ id: mobileImportUnmatched.id })
        .from(mobileImportUnmatched)
        .where(
          and(
            eq(mobileImportUnmatched.yearMonth, yearMonth),
            eq(mobileImportUnmatched.status, "pending"),
            inArray(mobileImportUnmatched.rawName, Array.from(unmatchedMap.keys()))
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
  });

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

    const softBankFile = formData.get("softBank") as File | null;

    const result: Record<string, ImportResult> = {};

    if (softBankFile) {
      // 画面側で圧縮されている場合は展開する（Cloud Runのリクエスト上限32MiB対策）
      const buffer = gunzipIfNeeded(await softBankFile.arrayBuffer());
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