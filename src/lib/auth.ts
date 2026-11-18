import "server-only";
import NextAuth from "next-auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authConfig } from "./auth.config";
import { checkGoogleLogin, normalizeEmail } from "./google-login";

async function findUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).get();
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      const check = checkGoogleLogin(
        profile as { email?: string; email_verified?: boolean; hd?: string } | undefined
      );
      if (!check.ok) return `/login?error=${check.error}`;
      const user = await findUserByEmail(check.email);
      if (!user) {
        console.warn(`[auth] 未発行のアカウントでのログインを拒否: ${check.email}`);
        return "/login?error=NotRegistered";
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      // ログインした瞬間だけ、Google の ID ではなく users テーブルの ID と権限を入れる
      if (account) {
        const user = await findUserByEmail(normalizeEmail(profile?.email));
        if (!user) throw new Error("users に存在しないアカウントです");
        token.id = user.id;
        token.role = user.role;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
  },
});

// Type augmentation
declare module "next-auth" {
  interface User {
    role: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
  }
}
