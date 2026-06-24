import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const { userId } = (await req.json()) as { userId: string };

  await db
    .update(users)
    .set({
      sfUserId: null,
      sfAccessToken: null,
      sfRefreshToken: null,
      sfTokenExpiresAt: null,
      sfInstanceUrl: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId));

  await logActivity({
    userId: session.user.id,
    actionType: "sf_disconnect",
    message: `SF連携を解除しました (対象ユーザー: ${userId})`,
    targetTable: "users",
    targetId: userId,
  });

  return NextResponse.json({ success: true });
}
