/**
 * CSVバッファを文字コード自動判定で復号する。
 * UTF-8として完全に妥当なバイト列（置換文字なし）はUTF-8として扱い、
 * そうでなければShift-JIS(CP932)として復号する
 * （Shift-JISファイルをUTF-8で読むと必ず置換文字が発生するため誤判定しない）。
 *
 * SoftBank・CDR等のキャリア出力CSVはShift-JISのものが混在するため、
 * ファイル取込では必ずこの関数を通す。
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("shift_jis").decode(buffer);
}
