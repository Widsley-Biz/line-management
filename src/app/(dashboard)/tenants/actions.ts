"use server";
import { db } from "@/lib/db";
import {
  tenants,
  mobileLines,
  mobileUsages,
  mobileUsageDetails,
  ipNumbers,
  ipUsages,
  ipUsageDetails,
  ipTariffs,
  ipImportUnmatched,
  actions,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
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
  await db.delete(ipUsageDetails).where(eq(ipUsageDetails.tenantId, id));
  await db.delete(ipUsages).where(eq(ipUsages.tenantId, id));
  await db.delete(ipNumbers).where(eq(ipNumbers.tenantId, id));
  await db.delete(ipTariffs).where(eq(ipTariffs.tenantId, id));
  await db.delete(ipImportUnmatched).where(eq(ipImportUnmatched.resolvedTenantId, id));
  await db.delete(actions).where(eq(actions.tenantId, id));

  // 旧IP回線構造の残存データ（Phase Eのテーブル削除まではFK制約が残るため）
  for (const table of ["call_logs", "monthly_usages", "tenant_assignments", "tenant_packs", "channel_groups"]) {
    try {
      await db.run(
        sql.raw(`DELETE FROM ${table} WHERE tenant_id = '${id.replace(/'/g, "''")}'`)
      );
    } catch {
      // テーブルが既に削除済みの場合は無視
    }
  }

  await db.delete(tenants).where(eq(tenants.id, id));

  revalidatePath("/tenants");
}
