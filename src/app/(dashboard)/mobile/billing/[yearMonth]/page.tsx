import { db } from "@/lib/db";
import { mobileUsages, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatYen } from "@/lib/format";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MonthPicker } from "@/components/month-picker";
import { MobileBillingClient } from "./mobile-billing-client";

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

function getBillingMonth(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  const d = new Date(year, month - 1 + 3, 1);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export default async function MobileBillingPage({
  params,
}: {
  params: Promise<{ yearMonth: string }>;
}) {
  const { yearMonth } = await params;
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) notFound();

  const rows = await db
    .select({
      id: mobileUsages.id,
      tenantId: mobileUsages.tenantId,
      companyName: tenants.companyName,
      totalLines: mobileUsages.totalLines,
      overageTotal: mobileUsages.overageTotal,
      sfStatus: mobileUsages.sfStatus,
      sfSentAt: mobileUsages.sfSentAt,
      sfErrorMessage: mobileUsages.sfErrorMessage,
      importedAt: mobileUsages.importedAt,
    })
    .from(mobileUsages)
    .innerJoin(tenants, eq(mobileUsages.tenantId, tenants.id))
    .where(eq(mobileUsages.yearMonth, yearMonth))
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
            href={`/mobile/billing/${prevMonth(yearMonth)}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <MonthPicker yearMonth={yearMonth} basePath="/mobile/billing" />
          <Link
            href={`/mobile/billing/${nextMonth(yearMonth)}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <MobileBillingClient rows={rows} yearMonth={yearMonth} />
    </div>
  );
}