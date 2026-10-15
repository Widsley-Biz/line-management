// 旧実装(全文を文字列化して split)と新実装(cdr-lines.ts)の取込結果が一致することを確認する。
// 実行: npx tsx --test tests/cdr-lines.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { gzipSync, gunzipSync } from "zlib";
import { readFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { forEachCdrLine, scanCdrBytes } from "../src/lib/cdr-lines";

// ---- 旧実装(リファレンス): cdr-import.ts / gzip.ts / csv.ts の元の処理をそのまま写したもの ----
function oldPipeline(input: Uint8Array) {
  const isGz = input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b;
  const content = isGz ? gunzipSync(Buffer.from(input)) : Buffer.from(input);
  const fileHash = createHash("sha256").update(content).digest("hex");
  const ab = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
  const utf8 = new TextDecoder("utf-8").decode(ab);
  const text = utf8.includes("�") ? new TextDecoder("shift_jis").decode(ab) : utf8;
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return { fileHash, lines };
}

async function newPipeline(input: Uint8Array) {
  const { fileHash, encoding } = await scanCdrBytes(input);
  const lines: string[] = [];
  const headers: boolean[] = [];
  const { nonBlankLines } = await forEachCdrLine(input, encoding, (l, h) => {
    lines.push(l);
    headers.push(h);
  });
  return { fileHash, lines, headers, nonBlankLines, encoding };
}

async function assertSame(name: string, input: Uint8Array) {
  const o = oldPipeline(input);
  const n = await newPipeline(input);
  assert.equal(n.fileHash, o.fileHash, `${name}: ハッシュ不一致(二重取込の原因になる)`);
  assert.equal(n.nonBlankLines, o.lines.length, `${name}: 行数不一致`);
  assert.equal(n.lines.length, o.lines.length, `${name}: 行数不一致`);
  for (let i = 0; i < o.lines.length; i++) {
    if (n.lines[i] !== o.lines[i]) assert.fail(`${name}: ${i}行目が不一致\n old=${JSON.stringify(o.lines[i])}\n new=${JSON.stringify(n.lines[i])}`);
  }
  if (n.headers.length) assert.deepEqual([n.headers[0], ...n.headers.slice(1).filter(Boolean)], [true]);
}

const HEADER =
  "請求アカウント,請求アカウント名称,請求月,利用月,部署名,ご利用番号,関連契約番号,通話種別名称,着信番号,通話開始年月日,通話開始時間,通話先電話番号,通話先地域,通話時間,通話料金";
function row(i: number, extra = "") {
  return `K202206009,株式会社Widsley／テスト,2026/06/01,2026/05/01,,03-${1000 + (i % 3000)}-${1000 + i},d711882704,国内通話料(固定宛),,2026/05/01,10:18:49.5,075-634-3088,　京　都　　,${i % 90},${(i % 7) * 0.144}${extra}`;
}
// Shift-JISのテストデータを作るため iconv コマンド(macOS/Linuxに標準)を呼ぶ。
// リポジトリにShift-JISエンコーダの依存がないため、テストのために依存を足さない方針。
function toSjis(s: string): Buffer {
  return execFileSync("iconv", ["-f", "UTF-8", "-t", "CP932"], { input: s, maxBuffer: 1 << 30 });
}

const body = (n: number, eol = "\r\n") => [HEADER, ...Array.from({ length: n }, (_, i) => row(i))].join(eol) + eol;

test("Shift-JIS / CRLF / 末尾改行あり", async () => assertSame("sjis-crlf", toSjis(body(500))));
test("Shift-JIS / LFのみ", async () => assertSame("sjis-lf", toSjis(body(500, "\n"))));
test("UTF-8 / CRLF", async () => assertSame("utf8-crlf", Buffer.from(body(500))));
test("UTF-8 BOM付き", async () => assertSame("utf8-bom", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body(500))])));
test("末尾に改行なし", async () => assertSame("no-final-nl", toSjis(body(300).replace(/\r\n$/, ""))));
test("末尾に改行なし + 最終行の末尾が \\r のみ", async () => assertSame("final-cr", toSjis(body(300).replace(/\r\n$/, "\r"))));
test("途中・末尾の空行、空白だけの行", async () => assertSame("blank-lines", toSjis(`\r\n${HEADER}\r\n${row(1)}\r\n\r\n   \r\n${row(2)}\r\n\r\n\r\n`)));
test("単独の \\r は行区切りにしない(旧実装と同じ)", async () => assertSame("lone-cr", toSjis(`${HEADER}\r\n${row(1)}\r${row(2)}\r\n${row(3)}\r\r\n`)));
test("引用符内のカンマ・15列未満の行・空の利用月", async () => {
  const q = row(9).replace("株式会社Widsley／テスト", '"株式会社,Widsley"');
  await assertSame("quirky", toSjis([HEADER, q, "a,b,c", row(4).replace("2026/05/01,,", ",,"), row(5)].join("\r\n") + "\r\n"));
});
test("文字化け文字(U+FFFD)を含むUTF-8はShift-JIS扱い(旧実装と同じ)", async () => assertSame("fffd", Buffer.from(body(50) + "�,x\r\n")));
test("ヘッダーのみ・空ファイル", async () => {
  await assertSame("header-only", toSjis(HEADER + "\r\n"));
  await assertSame("empty", new Uint8Array(0));
  await assertSame("blank-only", Buffer.from("\r\n\r\n"));
});
test("gzip(通常 / 複数メンバー連結)", async () => {
  const raw = toSjis(body(2000));
  await assertSame("gz", gzipSync(raw));
  const h = Math.floor(raw.length / 2);
  await assertSame("gz-multi", Buffer.concat([gzipSync(raw.subarray(0, h)), gzipSync(raw.subarray(h))]));
});
test("1MiBのチャンク境界を多バイト文字がまたぐ(Shift-JIS / UTF-8)", async () => {
  for (const enc of ["sjis", "utf8"] as const) {
    for (const pad of [0, 1, 2, 3]) {
      // 境界付近に全角文字が来るよう、先頭のダミー行の長さを調整してファイルを1MiB超にする
      const lines = [HEADER, "x".repeat(1048576 - HEADER.length - 10 - pad), ...Array.from({ length: 3000 }, (_, i) => row(i))];
      const text = lines.join("\r\n") + "\r\n";
      await assertSame(`boundary-${enc}-${pad}`, enc === "sjis" ? toSjis(text) : Buffer.from(text));
    }
  }
});
test("大きいファイル(36万行・Shift-JIS)をgzipで送った場合", async () => {
  const raw = toSjis(body(360000));
  await assertSame("big-gz", gzipSync(raw));
});
test("途中で切れたgzip・壊れたgzipは、一部だけ取り込まず必ずエラーにする(新旧とも)", async () => {
  const raw = toSjis(body(20000));
  const gz = gzipSync(raw);
  const truncated = gz.subarray(0, gz.length - 200);
  assert.throws(() => oldPipeline(truncated));
  await assert.rejects(newPipeline(truncated));
  const corrupt = Buffer.from(gz);
  corrupt[Math.floor(corrupt.length / 2)] ^= 0xff;
  assert.throws(() => oldPipeline(corrupt));
  await assert.rejects(newPipeline(corrupt));
});
test("実CDR(ローカルにあれば)", async (t) => {
  const p = process.env.CDR_FIXTURE ?? `${process.env.HOME}/Downloads/cdr_K202206009_202605.csv`;
  if (!existsSync(p)) return t.skip("実ファイルなし");
  await assertSame("real", readFileSync(p));
  await assertSame("real-gz", gzipSync(readFileSync(p)));
});
