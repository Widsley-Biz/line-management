import { createHash } from "crypto";
import { Readable } from "stream";
import { createGunzip } from "zlib";

/**
 * CDR CSVを「全文を文字列にしない」で1行ずつ読むためのモジュール。
 *
 * 旧実装は gunzipSync → TextDecoder で全文を文字列化 → split で全行配列、と
 * ファイル全体を何通りもメモリに載せており、60MB・36万行でCloud Run(512Mi)がOOMになっていた。
 * ここではチャンク単位で処理するため、メモリはファイルサイズに依存しない。
 *
 * 取込結果を旧実装と1行も変えないことが最優先（請求金額に直結する）。そのため
 *  - ハッシュ: 展開後の全バイトのSHA-256（ip_import_files.file_hash の重複判定キー。旧実装と同一）
 *  - 文字コード: 旧 decodeCsvBuffer と同じ規則（UTF-8でデコードして U+FFFD が1つでもあればShift-JIS）
 *  - 行分割: 旧 split(/\r?\n/) と同じ（\r\n と \n で区切る。単独の \r は区切らない）
 *  - 空行: trim() が空の行は読み飛ばす。それ以外は trim せずそのまま渡す
 * を厳密に踏襲している。tests/cdr-lines.test.ts で旧実装と突き合わせている。
 *
 * server-only は付けない（DB非依存の純粋なモジュールで、テストから直接読み込むため）。
 */

export type CdrEncoding = "utf-8" | "shift_jis";

const RAW_CHUNK_BYTES = 1024 * 1024;

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** 展開後のバイト列をチャンクで返す（gzipなら逐次展開。メモリ上に全展開しない） */
async function* decompressedChunks(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  if (isGzip(bytes)) {
    const source = Readable.from([
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    ]);
    for await (const chunk of source.pipe(createGunzip())) {
      yield chunk as Uint8Array;
    }
    return;
  }
  for (let i = 0; i < bytes.length; i += RAW_CHUNK_BYTES) {
    yield bytes.subarray(i, Math.min(i + RAW_CHUNK_BYTES, bytes.length));
  }
}

/**
 * 1回目の走査: ハッシュと文字コードを決める。
 * UTF-8判定は旧実装（全文デコードして U+FFFD の有無を見る）と同じ結果になるよう、
 * ストリーミングデコーダで同じ判定をする（チャンク境界をまたぐ多バイト文字も正しく扱える）。
 */
export async function scanCdrBytes(
  bytes: Uint8Array
): Promise<{ fileHash: string; encoding: CdrEncoding }> {
  const hash = createHash("sha256");
  const probe = new TextDecoder("utf-8");
  let utf8Clean = true;

  for await (const chunk of decompressedChunks(bytes)) {
    hash.update(chunk);
    if (utf8Clean && probe.decode(chunk, { stream: true }).includes("�")) {
      utf8Clean = false;
    }
  }
  if (utf8Clean && probe.decode().includes("�")) utf8Clean = false;

  return {
    fileHash: hash.digest("hex"),
    encoding: utf8Clean ? "utf-8" : "shift_jis",
  };
}

/**
 * 2回目の走査: 空行を除いた各行を順に渡す。最初の空でない行がヘッダー（isHeader=true）。
 * 戻り値は空でない行の総数（旧実装の lines.length と同じ。2未満ならデータ行なし）。
 */
export async function forEachCdrLine(
  bytes: Uint8Array,
  encoding: CdrEncoding,
  onLine: (line: string, isHeader: boolean) => void
): Promise<{ nonBlankLines: number }> {
  const decoder = new TextDecoder(encoding);
  let pending: string[] = []; // 改行待ちの行の断片（巨大な1行でも連結コストが膨らまないよう配列で持つ）
  let nonBlankLines = 0;

  const emit = (line: string) => {
    if (!line.trim()) return;
    onLine(line, nonBlankLines === 0);
    nonBlankLines++;
  };

  const feed = (text: string) => {
    let start = 0;
    for (;;) {
      const nl = text.indexOf("\n", start);
      if (nl < 0) break;
      let line = pending.length > 0 ? pending.join("") + text.slice(start, nl) : text.slice(start, nl);
      pending = [];
      // \r\n の \r だけを落とす（旧 split(/\r?\n/) と同じ）
      if (line.endsWith("\r")) line = line.slice(0, -1);
      emit(line);
      start = nl + 1;
    }
    if (start < text.length) pending.push(text.slice(start));
  };

  for await (const chunk of decompressedChunks(bytes)) {
    feed(decoder.decode(chunk, { stream: true }));
  }
  feed(decoder.decode());
  // 末尾に改行がないファイルの最終行（この行の末尾 \r は旧実装でも残る）
  if (pending.length > 0) emit(pending.join(""));

  return { nonBlankLines };
}
