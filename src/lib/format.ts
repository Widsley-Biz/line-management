/** 円表示フォーマット ¥1,234,567 */
export function formatYen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** 秒数を hh:mm:ss 形式に変換 */
export function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** YYYY-MM を YYYY年MM月 に変換 */
export function formatYearMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${m}月`;
}

/** パーセント表示 */
export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/**
 * 電話番号を日本の一般的な表記（ハイフン区切り）に整形する。
 * 認識できないパターン（桁数不明・国際番号など）はハイフンなしのまま返す。
 */
export function formatJapanesePhoneNumber(raw: string): string {
  const digits = raw.replace(/[-‐−ー\s　]/g, "").trim();
  if (!/^0\d{9,10}$/.test(digits)) return digits;

  if (digits.length === 10) {
    if (digits.startsWith("0120")) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.startsWith("03") || digits.startsWith("06")) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    // その他の固定電話（3桁市外局番を想定した一般的な区切り）
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // 11桁: フリーダイヤル(0800)・携帯(090/080/070)・IP電話(050)
  if (digits.startsWith("0800")) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
