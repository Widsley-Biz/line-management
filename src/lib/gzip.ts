import "server-only";
import { gunzipSync } from "zlib";

/**
 * gzip圧縮されたバッファなら展開して返す。圧縮されていなければそのまま返す。
 *
 * Cloud Runのリクエストサイズ上限は32MiBで、大きなCDRファイル（58MB・365,102行など）は
 * そのままアップロードすると413で弾かれる。そのため画面側で大きいファイルを
 * gzip圧縮して送信しており、ここで展開する（実測で58.4MB→5.4MB）。
 *
 * 判定はgzipのマジックバイト（0x1f 0x8b）で行うため、ファイル名や
 * Content-Typeに依存しない。展開後のバッファでハッシュを計算すれば、
 * 圧縮の有無にかかわらず同一ファイルの重複スキップが正しく効く。
 */
export function gunzipIfNeeded(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return buffer;
  const out = gunzipSync(Buffer.from(bytes));
  return out.buffer.slice(
    out.byteOffset,
    out.byteOffset + out.byteLength
  ) as ArrayBuffer;
}
