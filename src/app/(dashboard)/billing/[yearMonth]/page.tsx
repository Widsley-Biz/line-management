import { db } from "@/lib/db";
import { callLogs, monthlyUsages, tenants } from "@/lib/db/schema";
import { eq, sum, count } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatYen, formatYearMonth } from "@/lib/format";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { SendSfButton } from "./send-sf-button";
import { MonthPicker } from "@/components/month-picker";
import { BillingTable } from "@/components/billing-table";
import { TenantCombobox } from "@/components/tenant-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { randomUUID } from "crypto";
import { calculateMonthlyBilling } from "@/lib/billing";

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

async function addManualCallLog(formData: FormData) {
  "use server";
  const ym = formData.get("yearMonth") as string;
  const tenantId = formData.get("tenantId") as string;
  const callDate = formData.get("callDate") as string;
  const phoneNumber = (formData.get("phoneNumber") as string) || "手動入力";
  const destinationNumber = (formData.get("destinationNumber") as string) || "";
  const destinationType = formData.get("destinationType") as "固定" | "携帯";
  const durationSeconds = parseInt(formData.get("durationSeconds") as string) || 0;
  const cost = parseFloat(formData.get("cost") as string) || 0;

  if (!tenantId || !ym || !callDate) return;

  await db.insert(callLogs).values({
    id: randomUUID(),
    tenantId,
    yearMonth: ym,
    callDate,
    phoneNumber,
    destinationNumber: destinationNumber || null,
    destinationType,
    durationSeconds,
    cost,
    source: "手動入力",
    importedAt: new Date().toISOString(),
  });

  // Recalculate billing from all call_logs (existing + newly added)
  await calculateMonthlyBilling(tenantId, ym);
  redirect(`/billing/${ym}`);
}

export default async function BillingMonthPage({
  params,
}: {
  params: Promise<{ yearMonth: string }>;
}) {
  const { yearMonth } = await params;

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) notFound();

  const rows = await db
    .select({
      id: monthlyUsages.id,
      tenantId: monthlyUsages.tenantId,
      companyName: tenants.companyName,
      sfOpportunityId: tenants.sfOpportunityId,
      totalPackPrice: monthlyUsages.totalPackPrice,
      totalCredit: monthlyUsages.totalCredit,
      ipCallCharge: monthlyUsages.ipCallCharge,
      overageCharge: monthlyUsages.overageCharge,
      overageFixed: monthlyUsages.overageFixed,
      overageMobile: monthlyUsages.overageMobile,
      rawCost: monthlyUsages.rawCost,
      grossProfit: monthlyUsages.grossProfit,
      sfStatus: monthlyUsages.sfStatus,
      sfSentAt: monthlyUsages.sfSentAt,
      dataSource: monthlyUsages.dataSource,
    })
    .from(monthlyUsages)
    .innerJoin(tenants, eq(monthlyUsages.tenantId, tenants.id))
    .where(eq(monthlyUsages.yearMonth, yearMonth))
    .orderBy(tenants.companyName);

  const allTenants = await db
    .select({ id: tenants.id, companyName: tenants.companyName })
    .from(tenants)
    .where(eq(tenants.status, "active"))
    .orderBy(tenants.companyName);

  const pendingCount = rows.filter((r) => r.sfStatus === "未送信").length;
  const totalOverage = rows.reduce((s, r) => s + r.overageCharge, 0);
  const totalProfit = rows.reduce((s, r) => s + r.grossProfit, 0);

  return (
    <div className="space-y-6">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">月次請求管理</h1>
          <p className="text-sm text-gray-500 mt-1">{formatYearMonth(yearMonth)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/billing/${prevMonth(yearMonth)}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <MonthPicker yearMonth={yearMonth} />
          <Link
            href={`/billing/${nextMonth(yearMonth)}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">SF送信待ち</p>
            <p className="text-2xl font-bold text-amber-600">{pendingCount} 件</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">総超過料金</p>
            <p className="text-2xl font-bold">{formatYen(totalOverage)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">推定粗利</p>
            <p className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
              {formatYen(totalProfit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bulk send button */}
      {pendingCount > 0 && (
        <div className="flex justify-end">
          <SendSfButton
            tenants={rows
              .filter((r) => r.sfStatus === "未送信")
              .map((r) => ({ tenantId: r.tenantId, companyName: r.companyName }))}
            yearMonth={yearMonth}
            bulk
          />
        </div>
      )}

      {/* Manual call log entry */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" />
            通話ログ手動追加
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-3">
            未照合だった番号など、取り込めなかった通話ログを手動で追加します。追加後は自動で請求再計算されます。
          </p>
          <form action={addManualCallLog} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input type="hidden" name="yearMonth" value={yearMonth} />
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">会社 *</Label>
              <TenantCombobox tenants={allTenants} name="tenantId" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">通話日 *</Label>
              <Input name="callDate" type="date" required className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">種別 *</Label>
              <select name="destinationType" required className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="固定">固定</option>
                <option value="携帯">携帯</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">発信番号</Label>
              <Input name="phoneNumber" placeholder="例: 0312345678" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">着信番号</Label>
              <Input name="destinationNumber" placeholder="任意" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">通話時間(秒)</Label>
              <Input name="durationSeconds" type="number" min="0" defaultValue="0" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">原価金額(円)</Label>
              <Input name="cost" type="number" min="0" step="0.01" defaultValue="0" className="h-8 text-sm" />
            </div>
            <div className="col-span-2 md:col-span-4 flex items-center gap-2">
              <Button type="submit" size="sm">追加して再計算</Button>
              <span className="text-xs text-gray-400">既存データは上書きされません</span>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-4">
          <BillingTable rows={rows} yearMonth={yearMonth} sfOrgUrl={process.env.NEXT_PUBLIC_SF_ORG_URL} />
        </CardContent>
      </Card>
    </div>
  );
}
