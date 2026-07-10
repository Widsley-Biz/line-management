import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipNumbers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phoneNumber, subNumber, tenantId, status, notes } = body;

    if (!phoneNumber || !tenantId) {
      return NextResponse.json({ error: "電話番号と取引先IDは必須です" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    await db.insert(ipNumbers).values({
      id,
      phoneNumber,
      subNumber: subNumber || null,
      tenantId,
      status: status ?? "契約中",
      notes: notes || null,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity({
      actionType: "tenant_create",
      message: `IP回線番号登録: ${phoneNumber}`,
      targetTable: "ip_numbers",
      targetId: id,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP master POST error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, phoneNumber, subNumber, tenantId, status, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    const now = new Date().toISOString();

    await db.update(ipNumbers).set({
      phoneNumber,
      subNumber: subNumber || null,
      tenantId,
      status,
      notes: notes || null,
      updatedAt: now,
    }).where(eq(ipNumbers.id, id));

    await logActivity({
      actionType: "tenant_update",
      message: `IP回線番号更新: ${phoneNumber}`,
      targetTable: "ip_numbers",
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP master PUT error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    await db.delete(ipNumbers).where(eq(ipNumbers.id, id));

    await logActivity({
      actionType: "tenant_update",
      message: `IP回線番号削除`,
      targetTable: "ip_numbers",
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP master DELETE error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
