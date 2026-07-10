import { db } from "@/lib/db";
import { ipUsages, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MonthPicker } from "@/components/month-picker";
import { IpBillingClient } from "./ip-billing-client";

function prevMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// IP回線の請求月は利用月+1ヶ月（携帯回線の+2ヶ月とは異なる）
function getBillingMonth(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  const d = new Date(year, month - 1 + 1, 1);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export default async function IpBillingPage({
  params,
}: {
  params: Promise<{ yearMonth: string }>;
}) {
  const { yearMonth } = await params;
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) notFound();

  const rows = await db
    .select({
      id: ipUsages.id,
      tenantId: ipUsages.tenantId,
      companyName: tenants.companyName,
      sfOpportunityId: tenants.sfOpportunityId,
      fixedAmount: ipUsages.fixedAmount,
      mobileNaviAmount: ipUsages.mobileNaviAmount,
      totalAmount: ipUsages.totalAmount,
      sfStatus: ipUsages.sfStatus,
      sfSentAt: ipUsages.sfSentAt,
      sfErrorMessage: ipUsages.sfErrorMessage,
      importedAt: ipUsages.importedAt,
    })
    .from(ipUsages)
    .innerJoin(tenants, eq(ipUsages.tenantId, tenants.id))
    .where(eq(ipUsages.yearMonth, yearMonth))
    .orderBy(tenants.companyName);

  const billingMonth = getBillingMonth(yearMonth);
  const [ymYear, ymMonth] = yearMonth.split("-").map(Number);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">月次請求管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            {ymYear}年{ymMonth}月利用分 → 請求月: {billingMonth}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/ip/billing/${prevMonth(yearMonth)}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <MonthPicker yearMonth={yearMonth} basePath="/ip/billing" />
          <Link
            href={`/ip/billing/${nextMonth(yearMonth)}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <IpBillingClient rows={rows} yearMonth={yearMonth} />
    </div>
  );
}
