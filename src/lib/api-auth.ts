import "server-only";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

/**
 * API ルート用の認可ヘルパー。
 *
 * src/middleware.ts の matcher は `/api` を除外しているため、
 * API ルートは middleware の認証を通らない。既存の業務APIの多くが
 * 無認証で叩ける状態になっているが、それは別タスクとして扱い、
 * ここでは新規に追加するルートを個別に守る。
 *
 * 使い方:
 *   const guard = await requireRole(["admin", "leader"]);
 *   if (!guard.ok) return guard.response;
 *   guard.session.user.id を使う
 */

export type { Role } from "@/lib/roles";
import type { Role } from "@/lib/roles";

export type Guard =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

export async function requireUser(): Promise<Guard> {
  const session = (await auth().catch(() => null)) as Session | null;
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      ),
    };
  }
  return { ok: true, session };
}

export async function requireRole(roles: Role[]): Promise<Guard> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  const role = guard.session.user.role as Role | undefined;
  if (!role || !roles.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "この操作を行う権限がありません" },
        { status: 403 }
      ),
    };
  }
  return guard;
}
