// Googleログインの可否判定（DBに触らない純関数。tests/google-login.test.ts で確認）
import { ALLOWED_GOOGLE_DOMAIN } from "./auth.config";

/** ログイン画面に出すエラー種別（src/app/login/page.tsx と対応） */
export type LoginError = "DomainNotAllowed" | "NotRegistered";

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * ログインを許す条件（すべて満たすこと）:
 *  1. Google がメールアドレスを確認済み
 *  2. widsley.com の Google Workspace アカウント（id_token の hd で判定。
 *     個人Gmailに widsley.com のアドレスを登録しただけのアカウントは hd を持たない）
 *  3. 設定画面でユーザーとして発行済み（ここで自動作成はしない）
 */
export function checkGoogleLogin(
  profile: { email?: string | null; email_verified?: boolean | null; hd?: string | null } | undefined
): { ok: true; email: string } | { ok: false; error: LoginError } {
  const email = normalizeEmail(profile?.email);
  if (
    !profile?.email_verified ||
    profile.hd !== ALLOWED_GOOGLE_DOMAIN ||
    !email.endsWith(`@${ALLOWED_GOOGLE_DOMAIN}`)
  ) {
    return { ok: false, error: "DomainNotAllowed" };
  }
  return { ok: true, email };
}
