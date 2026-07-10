import "server-only";
import { db } from "@/lib/db";
import { ipTariffs, ipUsages, ipUsageDetails } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";

/** 課金4パターン */
export type CallCategory = "固定" | "携帯" | "ナビ秒" | "ナビ金額";

export type Tariff = {
  fixedRate: number;
  mobileRate: number;
  naviSecRate: number;
  naviAmountRate: number;
};

export const DEFAULT_TARIFF: Tariff = {
  fixedRate: 0.06,
  mobileRate: 0.25,
  naviSecRate: 1.2,
  naviAmountRate: 10.5,
};

/**
 * 通話種別名称（CDR H列）→ 課金4パターンの分類。
 * 全角括弧・空白の揺れを吸収して判定する。該当なしは null。
 */
export function classifyCallType(callTypeName: string): CallCategory | null {
  const name = callTypeName
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/[\s　]/g, "");
  if (!name) return null;

  if (
    name === "国内通話料(固定宛)" ||
    name === "国内通話料(IP宛)" ||
    name === "フリーコール通話料(固定着)"
  ) {
    return "固定";
  }
  if (
    name === "国内通話料(携帯宛)" ||
    name === "フリーコール通話料(携帯着)"
  ) {
    return "携帯";
  }
  if (name === "ナビダイヤル") return "ナビ秒";
  if (name === "その他料金") return "ナビ金額";
  return null;
}

/** 電話番号の正規化（ハイフン・空白除去） */
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/[-‐−ー\s　]/g, "").trim();
}

/** 利用月（YYYYMM / YYYY/MM / YYYY-MM）→ YYYY-MM に正規化。不正は null */
export function normalizeYearMonth(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 6) return null;
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  if (Number(m) < 1 || Number(m) > 12) return null;
  return `${y}-${m}`;
}

/** デフォルトタリフを取得（未登録時はハードコード値にフォールバック） */
export async function getDefaultTariff(): Promise<Tariff> {
  const [row] = await db
    .select()
    .from(ipTariffs)
    .where(isNull(ipTariffs.tenantId))
    .limit(1);
  return row ?? DEFAULT_TARIFF;
}

/** 取引先のタリフを取得（取引先別上書き → デフォルトの順） */
export async function getTariffForTenant(tenantId: string): Promise<Tariff> {
  const [override] = await db
    .select()
    .from(ipTariffs)
    .where(eq(ipTariffs.tenantId, tenantId))
    .limit(1);
  if (override) return override;
  return getDefaultTariff();
}

/** カテゴリ別のタリフ計算（番号単位の内訳は小数のまま） */
export function computeAmount(
  category: CallCategory,
  totalSeconds: number,
  sourceAmount: number,
  tariff: Tariff
): number {
  switch (category) {
    case "固定":
      return totalSeconds * tariff.fixedRate;
    case "携帯":
      return totalSeconds * tariff.mobileRate;
    case "ナビ秒":
      return totalSeconds * tariff.naviSecRate;
    case "ナビ金額":
      return sourceAmount * tariff.naviAmountRate;
  }
}

/**
 * 取引先×利用月の ip_usages を明細（ip_usage_details）から再集計する。
 * 端数処理はSF商品単位で切り上げ（①固定分 / ②携帯＋ナビ分 の計2回）。
 * 再計算後はSFステータスを「未送信」に戻す（差分取込で金額が変わるため）。
 */
export async function recalcIpUsage(
  tenantId: string,
  yearMonth: string
): Promise<string> {
  const details = await db
    .select({
      callCategory: ipUsageDetails.callCategory,
      computedAmount: ipUsageDetails.computedAmount,
    })
    .from(ipUsageDetails)
    .where(
      and(
        eq(ipUsageDetails.tenantId, tenantId),
        eq(ipUsageDetails.yearMonth, yearMonth)
      )
    );

  let fixedRaw = 0;
  let mobileNaviRaw = 0;
  for (const d of details) {
    if (d.callCategory === "固定") fixedRaw += d.computedAmount;
    else mobileNaviRaw += d.computedAmount; // 携帯＋ナビ秒＋ナビ金額は合算
  }

  const fixedAmount = Math.ceil(fixedRaw);
  const mobileNaviAmount = Math.ceil(mobileNaviRaw);
  const totalAmount = fixedAmount + mobileNaviAmount;
  const now = new Date().toISOString();

  const [existing] = await db
    .select({ id: ipUsages.id })
    .from(ipUsages)
    .where(and(eq(ipUsages.tenantId, tenantId), eq(ipUsages.yearMonth, yearMonth)))
    .limit(1);

  if (existing) {
    await db
      .update(ipUsages)
      .set({
        fixedAmount,
        mobileNaviAmount,
        totalAmount,
        sfStatus: "未送信",
        sfErrorMessage: null,
        importedAt: now,
        updatedAt: now,
      })
      .where(eq(ipUsages.id, existing.id));
    return existing.id;
  }

  const id = randomUUID();
  await db.insert(ipUsages).values({
    id,
    tenantId,
    yearMonth,
    fixedAmount,
    mobileNaviAmount,
    totalAmount,
    sfStatus: "未送信",
    importedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * ip_usages の行を必ず取得（なければ作成）する。
 * 明細insert時のFK用。金額は recalcIpUsage で後から確定する。
 */
export async function ensureIpUsage(
  tenantId: string,
  yearMonth: string
): Promise<string> {
  const [existing] = await db
    .select({ id: ipUsages.id })
    .from(ipUsages)
    .where(and(eq(ipUsages.tenantId, tenantId), eq(ipUsages.yearMonth, yearMonth)))
    .limit(1);
  if (existing) return existing.id;

  const id = randomUUID();
  const now = new Date().toISOString();
  await db.insert(ipUsages).values({
    id,
    tenantId,
    yearMonth,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * IP回線の請求月（利用月+1ヶ月）の開始日・終了日。
 * 携帯回線（+2ヶ月）とはルールが異なる点に注意。
 */
export function getIpBillingPeriod(yearMonth: string): {
  billingMonth: string;
  startDate: string;
  endDate: string;
} {
  const [year, month] = yearMonth.split("-").map(Number);
  const billingDate = new Date(year, month - 1 + 1, 1);
  const by = billingDate.getFullYear();
  const bm = billingDate.getMonth() + 1;
  const billingYM = `${by}-${String(bm).padStart(2, "0")}`;
  const lastDay = new Date(by, bm, 0).getDate();
  return {
    billingMonth: billingYM,
    startDate: `${billingYM}-01`,
    endDate: `${billingYM}-${String(lastDay).padStart(2, "0")}`,
  };
}
