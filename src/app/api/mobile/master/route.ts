import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobileLines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phoneNumber, tenantId, status, contractStart, contractEnd, notes } = body;

    if (!phoneNumber || !tenantId) {
      return NextResponse.json({ error: "電話番号とテナントIDは必須です" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    await db.insert(mobileLines).values({
      id,
      phoneNumber,
      tenantId,
      status: status ?? "契約中",
      contractStart: contractStart || null,
      contractEnd: contractEnd || null,
      notes: notes || null,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity({
      actionType: "tenant_create",
      message: `携帯回線登録: ${phoneNumber}`,
      targetTable: "mobile_lines",
      targetId: id,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Mobile master POST error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, phoneNumber, tenantId, status, contractStart, contractEnd, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    const now = new Date().toISOString();

    await db.update(mobileLines).set({
      phoneNumber,
      tenantId,
      status,
      contractStart: contractStart || null,
      contractEnd: contractEnd || null,
      notes: notes || null,
      updatedAt: now,
    }).where(eq(mobileLines.id, id));

    await logActivity({
      actionType: "tenant_update",
      message: `携帯回線更新: ${phoneNumber}`,
      targetTable: "mobile_lines",
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Mobile master PUT error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    await db.delete(mobileLines).where(eq(mobileLines.id, id));

    await logActivity({
      actionType: "tenant_update",
      message: `携帯回線削除`,
      targetTable: "mobile_lines",
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Mobile master DELETE error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}