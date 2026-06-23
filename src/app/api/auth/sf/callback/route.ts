import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const userId = req.nextUrl.searchParams.get("state");
  const codeVerifier = req.cookies.get("sf_code_verifier")?.value;

  if (!code || !userId) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?sfError=パラメータ不正`);
  }

  if (!codeVerifier) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?sfError=${encodeURIComponent("セッション期限切れ。もう一度お試しください")}`
    );
  }

  const clientId = process.env.SF_CLIENT_ID!;
  const clientSecret = process.env.SF_CLIENT_SECRET!;
  const callbackUrl = `${process.env.NEXTAUTH_URL}/api/auth/sf/callback`;
  const loginUrl = process.env.SF_LOGIN_URL ?? "https://login.salesforce.com";

  try {
    // Exchange code for tokens (with PKCE code_verifier)
    const tokenRes = await fetch(`${loginUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("SF token exchange error:", err);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/settings?sfError=${encodeURIComponent("SF認証エラー")}`
      );
    }

    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      instance_url: string;
      id: string; // e.g. https://login.salesforce.com/id/00Dxx.../005xx...
      issued_at: string;
    };

    // Extract SF user ID from identity URL
    const sfUserId = token.id.split("/").pop()!;

    // Token expires in ~2 hours from issued_at
    const expiresAt = new Date(parseInt(token.issued_at) + 2 * 60 * 60 * 1000).toISOString();

    // Save tokens to user record
    await db
      .update(users)
      .set({
        sfUserId,
        sfAccessToken: token.access_token,
        sfRefreshToken: token.refresh_token,
        sfTokenExpiresAt: expiresAt,
        sfInstanceUrl: token.instance_url,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    await logActivity({
      userId,
      actionType: "sf_connect",
      message: `SF連携完了 (SF User: ${sfUserId})`,
      targetTable: "users",
      targetId: userId,
    });

    const successRes = NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?sfSuccess=1`);
    successRes.cookies.delete("sf_code_verifier");
    return successRes;
  } catch (error) {
    console.error("SF callback error:", error);
    const errorRes = NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?sfError=${encodeURIComponent("SF連携に失敗しました")}`
    );
    errorRes.cookies.delete("sf_code_verifier");
    return errorRes;
  }
}
