import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipUsages } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export async function PATCH(req: NextRequest) {
  const { usageIds, status, reason } = await req.json();
  if (!Array.isArray(usageIds) || usageIds.length === 0) {
    return NextResponse.json({ error: "usageIds required" }, { status: 400 });
  }
  const allowed = ["対応不要", "未送信"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await db
    .update(ipUsages)
    .set({
      sfStatus: status,
      // 対応不要に理由を保存、未送信に戻したらクリア
      sfNoActionReason: status === "対応不要" ? (typeof reason === "string" && reason.trim() ? reason.trim() : null) : null,
      updatedAt: now,
    })
    .where(inArray(ipUsages.id, usageIds));

  return NextResponse.json({ ok: true });
}
