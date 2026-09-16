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
import { assertRole } from "@/lib/action-auth";
import { logActivity } from "@/lib/audit";

export async function deleteTenant(id: string) {
  // 取引先の削除は請求実績まで連鎖削除する。画面側で確認ダイアログを必ず挟む
  const { userId } = await assertRole(["admin", "leader"]);

  // 削除すると追えなくなるので、消す前に内容を控えておく
  const target = await db
    .select({ companyName: tenants.companyName, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, id))
    .get();

  if (!target) throw new Error("取引先が見つかりません");

  const [mobileLineCount, ipNumberCount, mobileUsageCount, ipUsageCount] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(mobileLines).where(eq(mobileLines.tenantId, id)).get(),
    db.select({ n: sql<number>`count(*)` }).from(ipNumbers).where(eq(ipNumbers.tenantId, id)).get(),
    db.select({ n: sql<number>`count(*)` }).from(mobileUsages).where(eq(mobileUsages.tenantId, id)).get(),
    db.select({ n: sql<number>`count(*)` }).from(ipUsages).where(eq(ipUsages.tenantId, id)).get(),
  ]);

  const deleted = {
    mobileLines: mobileLineCount?.n ?? 0,
    ipNumbers: ipNumberCount?.n ?? 0,
    mobileUsages: mobileUsageCount?.n ?? 0,
    ipUsages: ipUsageCount?.n ?? 0,
  };

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

  await logActivity({
    userId,
    actionType: "tenant_delete",
    message:
      `取引先を削除しました: ${target.companyName}（コード: ${target.slug}）` +
      ` / 連鎖削除 携帯回線${deleted.mobileLines}件・IP番号${deleted.ipNumbers}件` +
      `・携帯請求${deleted.mobileUsages}件・IP請求${deleted.ipUsages}件`,
    targetTable: "tenants",
    targetId: id,
    afterJson: { companyName: target.companyName, slug: target.slug, deleted },
  });

  revalidatePath("/tenants");
}
