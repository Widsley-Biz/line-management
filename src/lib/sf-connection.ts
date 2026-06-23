import jsforce from "jsforce";
import type { Connection } from "jsforce";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Get SF connection using user's OAuth tokens.
 * Automatically refreshes expired access tokens.
 */
export async function getUserSFConnection(userId: string): Promise<Connection | null> {
  const [user] = await db
    .select({
      sfAccessToken: users.sfAccessToken,
      sfRefreshToken: users.sfRefreshToken,
      sfTokenExpiresAt: users.sfTokenExpiresAt,
      sfInstanceUrl: users.sfInstanceUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.sfRefreshToken || !user.sfInstanceUrl) {
    return null;
  }

  // Check if token is expired (with 5 min buffer)
  const isExpired =
    !user.sfTokenExpiresAt ||
    new Date(user.sfTokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpired) {
    // Refresh the token
    const refreshed = await refreshSFToken(userId, user.sfRefreshToken, user.sfInstanceUrl);
    if (!refreshed) return null;
    return new jsforce.Connection({
      instanceUrl: user.sfInstanceUrl,
      accessToken: refreshed.accessToken,
    });
  }

  return new jsforce.Connection({
    instanceUrl: user.sfInstanceUrl,
    accessToken: user.sfAccessToken!,
  });
}

async function refreshSFToken(
  userId: string,
  refreshToken: string,
  instanceUrl: string
): Promise<{ accessToken: string } | null> {
  const loginUrl = process.env.SF_LOGIN_URL ?? "https://login.salesforce.com";

  try {
    const res = await fetch(`${loginUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.SF_CLIENT_ID!,
        client_secret: process.env.SF_CLIENT_SECRET!,
      }),
    });

    if (!res.ok) {
      console.error("SF token refresh failed:", await res.text());
      return null;
    }

    const token = (await res.json()) as {
      access_token: string;
      issued_at: string;
    };

    const expiresAt = new Date(parseInt(token.issued_at) + 2 * 60 * 60 * 1000).toISOString();

    await db
      .update(users)
      .set({
        sfAccessToken: token.access_token,
        sfTokenExpiresAt: expiresAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    return { accessToken: token.access_token };
  } catch (error) {
    console.error("SF token refresh error:", error);
    return null;
  }
}

/**
 * Get SF connection using system-level client_credentials (fallback).
 */
export async function getSystemSFConnection(): Promise<Connection> {
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  const instanceUrl = process.env.SF_INSTANCE_URL ?? "https://login.salesforce.com";

  if (!clientId || !clientSecret) {
    throw new Error("SF_CLIENT_ID または SF_CLIENT_SECRET が設定されていません");
  }

  const tokenRes = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`SF認証エラー: ${err}`);
  }

  const token = (await tokenRes.json()) as { access_token: string; instance_url: string };

  return new jsforce.Connection({
    instanceUrl: token.instance_url,
    accessToken: token.access_token,
  });
}
