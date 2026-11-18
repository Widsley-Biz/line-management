// 接続元IPが日本に割り当てられたものかを判定する。
// middleware（Edge ランタイム）から使うので Node.js 専用の API は使わない。
//
// 一覧は scripts/update-jp-ip-ranges.mjs で APNIC の公開統計から作る。
import ranges from "./jp-ip-ranges.json";

const V4: [number, number][] = ranges.v4 as [number, number][];

type V6Prefix = { base: bigint; mask: bigint; len: number };
const V6: V6Prefix[] = (ranges.v6 as string[])
  .map((cidr) => {
    const [addr, lenStr] = cidr.split("/");
    const len = Number(lenStr);
    const value = parseIpv6(addr);
    if (value === null) return null;
    const mask = len === 0 ? BigInt(0) : ((BigInt(1) << BigInt(128)) - BigInt(1)) ^ ((BigInt(1) << BigInt(128 - len)) - BigInt(1));
    return { base: value & mask, mask, len };
  })
  .filter((p): p is V6Prefix => p !== null);

export const JP_IP_LIST_SERIAL: string = ranges.serial;

export function parseIpv4(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((n) => n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

export function parseIpv6(ip: string): bigint | null {
  let s = ip.trim().toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (!s.includes(":")) return null;

  // 末尾が IPv4 表記（::ffff:1.2.3.4 など）なら16bit×2に直す
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (v4 === null) return null;
    s = `${s.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];

  let value = BigInt(0);
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    value = (value << BigInt(16)) | BigInt(parseInt(g, 16));
  }
  return value;
}

function inV4(n: number): boolean {
  let lo = 0;
  let hi = V4.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = V4[mid];
    if (n < start) hi = mid - 1;
    else if (n > end) lo = mid + 1;
    else return true;
  }
  return false;
}

/** ループバック・プライベート（手元の開発用）。本番では使わない */
export function isLocalIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4 !== null) {
    const a = v4 >>> 24;
    const b = (v4 >>> 16) & 0xff;
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v6 = parseIpv6(ip);
  if (v6 === null) return false;
  if (v6 === BigInt(1)) return true; // ::1
  if (v6 >> BigInt(32) === BigInt(0xffff)) return isLocalIp(ipv4FromMapped(v6));
  return v6 >> BigInt(121) === BigInt(0x7e); // fc00::/7
}

function ipv4FromMapped(v6: bigint): string {
  const n = Number(v6 & BigInt(0xffffffff));
  return [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join(".");
}

export function isJapanIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4 !== null) return inV4(v4);

  const v6 = parseIpv6(ip);
  if (v6 === null) return false;
  if (v6 >> BigInt(32) === BigInt(0xffff)) return inV4(Number(v6 & BigInt(0xffffffff))); // ::ffff:a.b.c.d
  return V6.some((p) => (v6 & p.mask) === p.base);
}

/**
 * Cloud Run の前段（Google Front End）は、クライアントが送ってきた X-Forwarded-For の
 * 末尾に実際の接続元IPを足して渡してくる。先頭は利用者が自由に書けてしまうので、
 * 必ず末尾を使う。
 * ※ 将来ロードバランサを挟むと末尾が LB のIPになるので、ここを見直すこと。
 */
export function clientIpFromForwardedFor(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}
