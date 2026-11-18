// 日本に割り当てられたIPアドレスの一覧を APNIC の公開統計から作り直す。
//
// 実行: node scripts/update-jp-ip-ranges.mjs
//       （ダウンロード済みのファイルを使うときは引数にパスを渡す）
//
// 出力: src/lib/geo/jp-ip-ranges.json
//   v4: [[開始, 終了], ...]  32bit整数。隣り合う範囲はまとめてある
//   v6: ["2001:200::/23", ...]
//
// IPの割り当ては月に数十件ずつ増えるので、月1回くらい作り直して push する。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOURCE = "https://ftp.apnic.net/stats/apnic/delegated-apnic-latest";
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/geo/jp-ip-ranges.json"
);

const text = process.argv[2]
  ? readFileSync(process.argv[2], "utf8")
  : await (await fetch(SOURCE)).text();

function ipv4ToInt(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`IPv4として読めません: ${ip}`);
  }
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

const v4 = [];
const v6 = [];
let serial = "";

for (const line of text.split("\n")) {
  if (line.startsWith("#") || !line.trim()) continue;
  const f = line.split("|");
  if (f[0] === "2" && f[1] === "apnic") serial = f[2]; // ヘッダ行: 2|apnic|<serial>|...
  if (f[0] !== "apnic" || f[1] !== "JP") continue;
  if (f[6] !== "allocated" && f[6] !== "assigned") continue;
  if (f[2] === "ipv4") {
    const start = ipv4ToInt(f[3]);
    v4.push([start, start + Number(f[4]) - 1]);
  } else if (f[2] === "ipv6") {
    v6.push(`${f[3]}/${f[4]}`);
  }
}

// 件数が極端に少ないときはダウンロード失敗とみなす（空の一覧で全員締め出さないため）
if (v4.length < 1000 || v6.length < 100) {
  throw new Error(`日本の範囲が少なすぎます（IPv4 ${v4.length} / IPv6 ${v6.length}）。取得元を確認してください`);
}

v4.sort((a, b) => a[0] - b[0]);
const merged = [];
for (const r of v4) {
  const last = merged[merged.length - 1];
  if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
  else merged.push([r[0], r[1]]);
}

writeFileSync(
  OUT,
  JSON.stringify({ source: SOURCE, serial, generatedAt: new Date().toISOString(), v4: merged, v6 }) + "\n"
);
console.log(`書き出しました: ${OUT}`);
console.log(`  IPv4 ${v4.length}件 → まとめて ${merged.length}範囲 / IPv6 ${v6.length}件 / serial ${serial}`);
