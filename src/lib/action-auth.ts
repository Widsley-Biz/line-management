import "server-only";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/api-auth";

/**
 * Server Action 用の認可ヘルパー。
 *
 * API ルート用の requireRole() は NextResponse を返すため Server Action では使えない。
 * こちらは権限がなければ例外を投げて処理を止める。
 *
 * 画面側でもボタンを出し分けているので通常ここには到達しないが、
 * 直接 POST された場合の最後の砦として置く。
 *
 * 使い方:
 *   const { userId } = await assertRole(["admin", "leader"]);
 */
export async function assertRole(
  roles: Role[]
): Promise<{ userId: string; role: Role }> {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  const role = session?.user?.role as Role | undefined;

  if (!userId) throw new Error("ログインが必要です");
  if (!role || !roles.includes(role)) {
    throw new Error("この操作を行う権限がありません");
  }
  return { userId, role };
}
