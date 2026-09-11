/**
 * 電話番号の取り扱いを一元化するモジュール。
 *
 * このプロジェクトには向きの違う2種類の変換が存在する。混同しないこと。
 *   - 正規化   : ハイフンを「外す」（normalizePhoneNumber）
 *   - 表示整形 : ハイフンを「付ける」（src/lib/format.ts の formatJapanesePhoneNumber）
 *
 * 番号同士の突合には必ず phoneMatchKey() を使う。
 * mobile_usage_details.phone_number には「070-1234-5678」と「07012345678」が
 * 混在しており、生文字列で join すると取りこぼす。
 *
 * server-only は付けない。DB非依存の純関数としてクライアント側・
 * バッチ側の双方から使えるようにしておくため。
 */

/** 電話番号の正規化（ハイフン・空白除去） */
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/[-‐−ー\s　]/g, "").trim();
}

/**
 * 電話番号の照合キー（ハイフン・空白除去に加え、先頭の0の有無を無視する）。
 * マスタCSVがExcel等で数値化され先頭の0が欠落するケースがあるため、
 * 番号同士の一致判定にはこちらを使う（保存値自体の正規化にはnormalizePhoneNumberを使う）。
 */
export function phoneMatchKey(raw: string): string {
  const normalized = normalizePhoneNumber(raw);
  return normalized.startsWith("0") ? normalized.slice(1) : normalized;
}
