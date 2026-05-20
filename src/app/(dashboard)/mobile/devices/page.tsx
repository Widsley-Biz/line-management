import { db } from "@/lib/db";
import { mobileUsageDetails, mobileLines, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { formatYen } from "@/lib/format";
import { DevicesTable } from "./devices-table-client";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MonthPicker } from "@/components/month-picker";

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

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

export default async function MobileDevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const { ym } = await searchParams;
  const yearMonth = ym ?? currentYearMonth();

  const details = await db
    .select({
      id: mobileUsageDetails.id,
      phoneNumber: mobileUsageDetails.phoneNumber,
      itemName: mobileUsageDetails.itemName,
      amount: mobileUsageDetails.amount,
      yearMonth: mobileUsageDetails.yearMonth,
      tenantId: mobileUsageDetails.tenantId,
      companyName: tenants.companyName,
    })
    .from(mobileUsageDetails)
    .innerJoin(tenants, eq(mobileUsageDetails.tenantId, tenants.id))
    .where(eq(mobileUsageDetails.yearMonth, yearMonth))
    .orderBy(tenants.companyName, mobileUsageDetails.phoneNumber);

  const lineInfoRows = await db
    .select({
      phoneNumber: mobileLines.phoneNumber,
      contractStart: mobileLines.contractStart,
      contractEnd: mobileLines.contractEnd,
      deviceReturned: mobileLines.deviceReturned,
    })
    .from(mobileLines);

  const lineInfoMap = new Map(lineInfoRows.map((l) => [l.phoneNumber, l]));

  type PhoneRow = {
    phoneNumber: string;
    tenantId: string;
    companyName: string;
    items: { itemName: string; amount: number }[];
    overageTotal: number;
    contractStart: string | null;
    contractEnd: string | null;
    deviceReturned: number;
  };

  const phoneMap = new Map<string, PhoneRow>();
  for (const d of details) {
    const key = d.phoneNumber;
    if (!phoneMap.has(key)) {
      const lineInfo = lineInfoMap.get(key);
      phoneMap.set(key, {
        phoneNumber: d.phoneNumber,
        tenantId: d.tenantId,
        companyName: d.companyName,
        items: [],
        overageTotal: 0,
        contractStart: lineInfo?.contractStart ?? null,
        contractEnd: lineInfo?.contractEnd ?? null,
        deviceReturned: lineInfo?.deviceReturned ?? 0,
      });
    }
    const row = phoneMap.get(key)!;
    row.items.push({ itemName: d.itemName, amount: d.amount });
    row.overageTotal += d.amount;
  }

  const rows = Array.from(phoneMap.values()).sort(
    (a, b) =>
      a.companyName.localeCompare(b.companyName) ||
      a.phoneNumber.localeCompare(b.phoneNumber)
  );

  const totalOverage = rows.reduce((s, r) => s + r.overageTotal, 0);

  return (
    <div className="space-y-6">
      {/* ヘッダー：右上に月ナビ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">契約端末一覧</h1>
          <p className="text-sm text-gray-500 mt-1">携帯番号ごとの超過項目明細</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/mobile/devices?ym=${prevMonth(yearMonth)}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <MonthPicker yearMonth={yearMonth} basePath="/mobile/devices?ym=" />
          <Link
            href={`/mobile/devices?ym=${nextMonth(yearMonth)}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">超過端末数</p>
            <p className="text-2xl font-bold">{rows.length} 台</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">超過合計</p>
            <p className="text-2xl font-bold text-red-600">{formatYen(totalOverage)}</p>
          </CardContent>
        </Card>
      </div>

      {/* テーブル */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              {yearMonth}のデータがありません。インポートを実行してください。
            </p>
          ) : (
            <DevicesTable rows={rows} yearMonth={yearMonth} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}