import { db } from "@/lib/db";
import { billingAccounts, channelGroups, phoneNumbers } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { BillingAccountsTable } from "@/components/billing-accounts-table";

export default async function BillingAccountsPage() {
  const rows = await db
    .select({
      id: billingAccounts.id,
      billingCode: billingAccounts.billingCode,
      name: billingAccounts.name,
      ipAddress: billingAccounts.ipAddress,
      status: billingAccounts.status,
      groupCount: sql<number>`count(distinct ${channelGroups.id})`,
      phoneCount: sql<number>`count(distinct ${phoneNumbers.id})`,
      totalContractCh: sql<number>`coalesce(sum(distinct ${channelGroups.contractCh}), 0)`,
    })
    .from(billingAccounts)
    .leftJoin(channelGroups, eq(channelGroups.billingAccountId, billingAccounts.id))
    .leftJoin(phoneNumbers, eq(phoneNumbers.channelGroupId, channelGroups.id))
    .groupBy(billingAccounts.id)
    .orderBy(billingAccounts.billingCode);

  const tableRows = rows.map((r) => ({
    ...r,
    ipAddress: r.ipAddress ?? "",
    groupCount: Number(r.groupCount),
    phoneCount: Number(r.phoneCount),
    totalContractCh: Number(r.totalContractCh),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">請求アカウント一覧</h1>
          <p className="text-sm text-gray-500 mt-1">{tableRows.length}件</p>
        </div>
        <Link
          href="/billing-accounts/new"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          <Plus className="h-4 w-4" />
          新規登録
        </Link>
      </div>
      <Card>
        <CardContent className="p-4 space-y-4">
          <BillingAccountsTable rows={tableRows} />
        </CardContent>
      </Card>
    </div>
  );
}