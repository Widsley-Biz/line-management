import { db } from "@/lib/db";
import { ipUsages, tenants } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { SfPendingClient } from "./sf-pending-client";

export default async function IpSfPendingPage() {
  const rows = await db
    .select({
      id: ipUsages.id,
      yearMonth: ipUsages.yearMonth,
      tenantId: ipUsages.tenantId,
      companyName: tenants.companyName,
      slug: tenants.slug,
      sfOpportunityId: tenants.sfOpportunityId,
      fixedAmount: ipUsages.fixedAmount,
      mobileNaviAmount: ipUsages.mobileNaviAmount,
      totalAmount: ipUsages.totalAmount,
      sfStatus: ipUsages.sfStatus,
      sfErrorMessage: ipUsages.sfErrorMessage,
    })
    .from(ipUsages)
    .innerJoin(tenants, eq(ipUsages.tenantId, tenants.id))
    .where(inArray(ipUsages.sfStatus, ["未送信", "エラー"]))
    .orderBy(ipUsages.yearMonth, tenants.companyName);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SF未送信一覧</h1>
        <p className="text-sm text-gray-500 mt-1">全月の未送信・エラーレコード一覧（IP回線）</p>
      </div>
      <SfPendingClient rows={rows} />
    </div>
  );
}
