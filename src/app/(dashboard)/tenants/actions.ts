"use server";
import { db } from "@/lib/db";
import {
  tenants,
  tenantAssignments,
  tenantPacks,
  monthlyUsages,
  mobileLines,
  mobileUsages,
  mobileUsageDetails,
  callLogs,
  actions,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function deleteTenant(id: string) {
  // 子テーブルを先に削除（FK制約）
  const usages = await db
    .select({ id: mobileUsages.id })
    .from(mobileUsages)
    .where(eq(mobileUsages.tenantId, id));
  for (const u of usages) {
    await db.delete(mobileUsageDetails).where(eq(mobileUsageDetails.mobileUsageId, u.id));
  }
  await db.delete(mobileUsages).where(eq(mobileUsages.tenantId, id));
  await db.delete(mobileLines).where(eq(mobileLines.tenantId, id));
  await db.delete(callLogs).where(eq(callLogs.tenantId, id));
  await db.delete(monthlyUsages).where(eq(monthlyUsages.tenantId, id));
  await db.delete(tenantAssignments).where(eq(tenantAssignments.tenantId, id));
  await db.delete(tenantPacks).where(eq(tenantPacks.tenantId, id));
  await db.delete(actions).where(eq(actions.tenantId, id));
  await db.delete(tenants).where(eq(tenants.id, id));

  revalidatePath("/tenants");
}
