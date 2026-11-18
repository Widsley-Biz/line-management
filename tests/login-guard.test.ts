// Googleログインの可否と国内IP判定を確認する。
// 実行: npx tsx --test tests/login-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGoogleLogin } from "../src/lib/google-login";
import {
  clientIpFromForwardedFor,
  isJapanIp,
  isLocalIp,
  parseIpv6,
} from "../src/lib/geo/jp-ip";

test("widsley.com の Workspace アカウントだけ通す", () => {
  assert.deepEqual(
    checkGoogleLogin({ email: "Hitomi.Nishimura@widsley.com", email_verified: true, hd: "widsley.com" }),
    { ok: true, email: "hitomi.nishimura@widsley.com" }
  );
  // hd が無い＝Workspace ではない（個人Gmailに社内アドレスを登録しただけ等）
  assert.equal(checkGoogleLogin({ email: "a@widsley.com", email_verified: true }).ok, false);
  assert.equal(checkGoogleLogin({ email: "a@gmail.com", email_verified: true, hd: "widsley.com" }).ok, false);
  assert.equal(checkGoogleLogin({ email: "a@widsley.com", email_verified: false, hd: "widsley.com" }).ok, false);
  assert.equal(checkGoogleLogin({ email: "a@example.com", email_verified: true, hd: "example.com" }).ok, false);
  assert.equal(checkGoogleLogin({ email: "a@evilwidsley.com", email_verified: true, hd: "widsley.com" }).ok, false);
  assert.equal(checkGoogleLogin(undefined).ok, false);
});

test("日本のIPv4を判定できる", () => {
  assert.equal(isJapanIp("1.0.16.1"), true); // APNIC JP 1.0.16.0/20
  assert.equal(isJapanIp("133.11.0.1"), true); // 東京大学
  assert.equal(isJapanIp("8.8.8.8"), false); // 米国
  assert.equal(isJapanIp("34.85.0.1"), false); // Google Cloud（東京リージョンでも米国登録）
  assert.equal(isJapanIp("1.1.1.1"), false);
  assert.equal(isJapanIp("not-an-ip"), false);
  assert.equal(isJapanIp("::ffff:133.11.0.1"), true);
});

test("日本のIPv6を判定できる", () => {
  assert.equal(isJapanIp("2001:200::1"), true); // WIDE
  assert.equal(isJapanIp("2001:4860:4860::8888"), false); // Google
  assert.equal(isJapanIp("2400:4050:0:0::1"), isJapanIp("2400:4050::1"));
});

test("IPv6の表記ゆれを読める", () => {
  assert.equal(parseIpv6("::1"), BigInt(1));
  assert.equal(parseIpv6("2001:db8::"), BigInt(0x20010db8) << BigInt(96));
  assert.equal(parseIpv6("::ffff:1.2.3.4"), (BigInt(0xffff) << BigInt(32)) | BigInt(0x01020304));
  assert.equal(parseIpv6("1:2:3:4:5:6:7:8:9"), null);
  assert.equal(parseIpv6("1::2::3"), null);
});

test("X-Forwarded-For は末尾（Googleが付けた実際の接続元）を使う", () => {
  assert.equal(clientIpFromForwardedFor("133.11.0.1, 8.8.8.8"), "8.8.8.8");
  assert.equal(clientIpFromForwardedFor("8.8.8.8"), "8.8.8.8");
  assert.equal(clientIpFromForwardedFor(null), null);
  assert.equal(clientIpFromForwardedFor(""), null);
});

test("ローカルIP", () => {
  for (const ip of ["127.0.0.1", "::1", "10.1.2.3", "192.168.0.5", "172.20.0.1", "::ffff:127.0.0.1", "fd00::1"]) {
    assert.equal(isLocalIp(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "2001:200::1"]) {
    assert.equal(isLocalIp(ip), false, ip);
  }
});
