import type { ObservedLine } from "@/lib/concierge/diff";
import { phoneMatchKey } from "@/lib/phone";

/**
 * concierge-bot（Cloud Run Job）から送られてくる1行ぶんの生データ。
 *
 * ボット側はサイトの見た目どおりの文字列を送るだけにして、正規化と検証は
 * すべてここで行う。サイトの改修でボットを直したときに、取り込み側の
 * 挙動が変わらないようにするため。
 */
export type ObservedRowInput = {
  phoneNumber?: string | null;
  contactName?: string | null;
  imei?: string | null;
  iccid?: string | null;
  deptCode?: string | null;
  deptName?: string | null;
  planName?: string | null;
  lineStatus?: string | null;
  /** 観測した全列。サイト改修に備えて丸ごと残す */
  raw?: Record<string, string> | null;
};

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** ICCID / IMEI はハイフン・空白を除いて数字だけにする */
const digits = (v: unknown): string | null => {
  const s = str(v);
  return s === null ? null : s.replace(/[\s-]/g, "");
};

export type ParseResult = {
  lines: ObservedLine[];
  /** 電話番号が取れずに捨てた行。ボット側のロケーターずれを検知するために数える */
  skipped: number;
};

/**
 * ボットからの生データを ObservedLine[] に変換する。
 *
 * 電話番号が取れない行だけは捨てる（突合キーが作れないため）。
 * IMEI/ICCID の桁数検証は validateIdentifiers（ingest 側）に任せ、
 * ここでは形を整えるだけにする。
 */
export function parseObservedRows(rows: ObservedRowInput[]): ParseResult {
  const lines: ObservedLine[] = [];
  let skipped = 0;

  for (const r of rows) {
    const phoneRaw = str(r.phoneNumber);
    if (!phoneRaw) {
      skipped++;
      continue;
    }
    const phoneKey = phoneMatchKey(phoneRaw);
    if (!phoneKey) {
      skipped++;
      continue;
    }

    lines.push({
      phoneKey,
      phoneRaw,
      contactName: str(r.contactName),
      imei: digits(r.imei),
      iccid: digits(r.iccid),
      deptCode: str(r.deptCode),
      deptName: str(r.deptName),
      planName: str(r.planName),
      lineStatus: str(r.lineStatus),
      raw: r.raw ?? {},
    });
  }

  return { lines, skipped };
}
