import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { randomBytes, createHash } from "crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未認証" }, { status: 401 });
  }

  const clientId = process.env.SF_CLIENT_ID;
  const callbackUrl = `${process.env.NEXTAUTH_URL}/api/auth/sf/callback`;
  const loginUrl = process.env.SF_LOGIN_URL ?? "https://login.salesforce.com";

  if (!clientId) {
    return NextResponse.json({ error: "SF_CLIENT_ID が未設定です" }, { status: 500 });
  }

  // Generate PKCE code_verifier and code_challenge
  const codeVerifier = randomBytes(32)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9\-._~]/g, "")
    .slice(0, 128);
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: "api refresh_token openid",
    state: session.user.id,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const response = NextResponse.redirect(
    `${loginUrl}/services/oauth2/authorize?${params}`
  );

  // Store code_verifier in cookie for callback to use
  response.cookies.set("sf_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // 本番(HTTPS)ではsecureクッキー、ローカルでは無効
    maxAge: 600, // 10 minutes
    path: "/api/auth/sf",
    sameSite: "lax",
  });

  return response;
}
