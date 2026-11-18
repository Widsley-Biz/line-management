// Edge-compatible auth config (no DB/Node.js-only imports)
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/** ログインを許す Google Workspace のドメイン */
export const ALLOWED_GOOGLE_DOMAIN = "widsley.com";

export const authConfig: NextAuthConfig = {
  providers: [
    // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET を環境変数から読む
    Google({
      authorization: {
        params: {
          // アカウント選択画面で widsley.com 以外を出さない（見た目の絞り込み。
          // 本当の判定は auth.ts の signIn で id_token の hd を見て行う）
          hd: ALLOWED_GOOGLE_DOMAIN,
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.user.role = (token as any).role as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.user.id = (token as any).id as string;
      return session;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
};
