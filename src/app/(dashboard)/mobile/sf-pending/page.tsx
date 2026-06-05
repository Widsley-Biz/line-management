import { db } from "@/lib/db";
import { mobileUsages, tenants } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { SfPendingClient } from "./sf-pending-client";

export default async function SfPendingPage() {
  const rows = await db
    .select({
      id: mobileUsages.id,
      yearMonth: mobileUsages.yearMonth,
      tenantId: mobileUsages.tenantId,
      companyName: tenants.companyName,
      slug: tenants.slug,
      sfOpportunityId: tenants.sfOpportunityId,
      overageTotal: mobileUsages.overageTotal,
      sfStatus: mobileUsages.sfStatus,
      sfErrorMessage: mobileUsages.sfErrorMessage,
    })
    .from(mobileUsages)
    .innerJoin(tenants, eq(mobileUsages.tenantId, tenants.id))
    .where(inArray(mobileUsages.sfStatus, ["未送信", "エラー"]))
    .orderBy(mobileUsages.yearMonth, tenants.companyName);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SF未送信一覧</h1>
        <p className="text-sm text-gray-500 mt-1">全月の未送信・エラーレコード一覧</p>
      </div>
      <SfPendingClient rows={rows} />
    </div>
  );
}
