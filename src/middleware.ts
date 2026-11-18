import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse, type NextRequest } from "next/server";
import { clientIpFromForwardedFor, isJapanIp, isLocalIp } from "@/lib/geo/jp-ip";

const { auth } = NextAuth(authConfig);

/**
 * 国内IP制限の対象外にする機械向けの入口。
 * どちらも Google Cloud（海外扱いのIP）から呼ばれ、ルート側で合言葉を確かめている。
 */
function isMachineRequest(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  // Cloud Run Job（concierge-bot）からの結果送信。実行ごとの callbackToken をルートで照合する
  if (pathname === "/api/concierge/observed") return true;
  // Cloud Scheduler からの毎朝の起動。合言葉が正しいときだけ通す（画面のボタンは対象外）
  if (pathname === "/api/concierge/sync") {
    const expected = process.env.SCHEDULER_TOKEN;
    return !!expected && req.headers.get("x-scheduler-token") === expected;
  }
  return false;
}

/** 国内IP以外は 403。判定できないときも本番では通さない */
function geoBlock(req: NextRequest): NextResponse | null {
  if (isMachineRequest(req)) return null;

  const ip = clientIpFromForwardedFor(req.headers.get("x-forwarded-for"));
  const isProd = process.env.NODE_ENV === "production";

  if (ip && isJapanIp(ip)) return null;
  if (!isProd && (!ip || isLocalIp(ip))) return null; // 手元の開発サーバー

  console.warn(`[geo] 国外または判定不能のIPを拒否: ${ip ?? "(不明)"} ${req.method} ${req.nextUrl.pathname}`);
  const message = "このサービスは日本国内からのみ利用できます。";
  return req.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: message }, { status: 403 })
    : new NextResponse(message, {
        status: 403,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
}

const authMiddleware = auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/login";

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export default async function middleware(req: NextRequest, ctx: unknown) {
  const blocked = geoBlock(req);
  if (blocked) return blocked;

  const { pathname } = req.nextUrl;
  // API と mock-concierge はこれまでどおりログイン判定をここでしない（各ルートで判定）。
  // mock-concierge は concierge-bot の動作確認用のダミーサイトで、本番では notFound() を返す。
  if (pathname.startsWith("/api/") || pathname.startsWith("/mock-concierge/")) {
    return NextResponse.next();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (authMiddleware as any)(req, ctx);
}

export const config = {
  // 国内IP制限のため API も通す。静的ファイルだけ除外する
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg|.*\\.jpg|.*\\.ico).*)",
  ],
};
