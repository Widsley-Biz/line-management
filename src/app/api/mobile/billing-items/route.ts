import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobileBillingItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const items = await db
    .select()
    .from(mobileBillingItems)
    .orderBy(mobileBillingItems.itemName);
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { itemName, isBillable, continuousImport } = await req.json();
  if (!itemName?.trim()) {
    return NextResponse.json({ error: "項目名は必須です" }, { status: 400 });
  }

  const { randomUUID } = await import("crypto");
  const now = new Date().toISOString();
  try {
    const [row] = await db
      .insert(mobileBillingItems)
      .values({ id: randomUUID(), itemName: itemName.trim(), isBillable: !!isBillable, continuousImport: !!continuousImport, createdAt: now, updatedAt: now })
      .returning();
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "同じ項目名が既に登録されています" }, { status: 409 });
  }
}

export async function PATCH(req: NextRequest) {
  const { id, isBillable, continuousImport } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const now = new Date().toISOString();
  await db
    .update(mobileBillingItems)
    .set({ isBillable, continuousImport, updatedAt: now })
    .where(eq(mobileBillingItems.id, id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(mobileBillingItems).where(eq(mobileBillingItems.id, id));
  return NextResponse.json({ ok: true });
}
