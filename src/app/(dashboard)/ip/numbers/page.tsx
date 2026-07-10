import { db } from "@/lib/db";
import { ipUsageDetails, ipNumbers, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { NumbersTable } from "./numbers-table-client";
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

export default async function IpNumbersPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const { ym } = await searchParams;
  const yearMonth = ym ?? currentYearMonth();

  const details = await db
    .select({
      id: ipUsageDetails.id,
      phoneNumber: ipUsageDetails.phoneNumber,
      callCategory: ipUsageDetails.callCategory,
      callTypeName: ipUsageDetails.callTypeName,
      totalSeconds: ipUsageDetails.totalSeconds,
      computedAmount: ipUsageDetails.computedAmount,
      tenantId: ipUsageDetails.tenantId,
      companyName: tenants.companyName,
    })
    .from(ipUsageDetails)
    .innerJoin(tenants, eq(ipUsageDetails.tenantId, tenants.id))
    .where(eq(ipUsageDetails.yearMonth, yearMonth))
    .orderBy(tenants.companyName, ipUsageDetails.phoneNumber);

  const numberInfoRows = await db
    .select({
      phoneNumber: ipNumbers.phoneNumber,
      subNumber: ipNumbers.subNumber,
      status: ipNumbers.status,
    })
    .from(ipNumbers);

  const numberInfoMap = new Map(numberInfoRows.map((n) => [n.phoneNumber, n]));

  type NumberRow = {
    phoneNumber: string;
    subNumber: string | null;
    status: string | null;
    tenantId: string;
    companyName: string;
    items: { callCategory: string; callTypeName: string; totalSeconds: number; amount: number }[];
    totalAmount: number;
  };

  const numberMap = new Map<string, NumberRow>();
  for (const d of details) {
    const key = d.phoneNumber;
    if (!numberMap.has(key)) {
      const info = numberInfoMap.get(key);
      numberMap.set(key, {
        phoneNumber: d.phoneNumber,
        subNumber: info?.subNumber ?? null,
        status: info?.status ?? null,
        tenantId: d.tenantId,
        companyName: d.companyName,
        items: [],
        totalAmount: 0,
      });
    }
    const row = numberMap.get(key)!;
    row.items.push({
      callCategory: d.callCategory,
      callTypeName: d.callTypeName,
      totalSeconds: d.totalSeconds,
      amount: d.computedAmount,
    });
    row.totalAmount += d.computedAmount;
  }

  const rows = Array.from(numberMap.values()).sort(
    (a, b) =>
      a.companyName.localeCompare(b.companyName) ||
      a.phoneNumber.localeCompare(b.phoneNumber)
  );

  return (
    <div className="space-y-6">
      {/* ヘッダー：右上に月ナビ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">契約番号一覧</h1>
          <p className="text-sm text-gray-500 mt-1">電話番号ごとの通話種別内訳</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/ip/numbers?ym=${prevMonth(yearMonth)}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <MonthPicker yearMonth={yearMonth} basePath="/ip/numbers?ym=" />
          <Link
            href={`/ip/numbers?ym=${nextMonth(yearMonth)}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              {yearMonth}のデータがありません。CDR CSVのインポートを実行してください。
            </p>
          ) : (
            <NumbersTable rows={rows} yearMonth={yearMonth} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
