import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobileUsages } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export async function PATCH(req: NextRequest) {
  const { usageIds, status } = await req.json();
  if (!Array.isArray(usageIds) || usageIds.length === 0) {
    return NextResponse.json({ error: "usageIds required" }, { status: 400 });
  }
  const allowed = ["対応不要", "未送信"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await db
    .update(mobileUsages)
    .set({ sfStatus: status, updatedAt: now })
    .where(inArray(mobileUsages.id, usageIds));

  return NextResponse.json({ ok: true });
}
