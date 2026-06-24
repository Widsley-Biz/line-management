"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/sortable-header";
import { Search, Download } from "lucide-react";
import { SendSfButton } from "@/app/(dashboard)/billing/[yearMonth]/send-sf-button";

type BillingRow = {
  id: string;
  tenantId: string;
  companyName: string;
  sfOpportunityId: string | null;
  totalPackPrice: number;
  totalCredit: number;
  ipCallCharge: number;
  overageCharge: number;
  overageFixed: number;
  overageMobile: number;
  rawCost: number;
  grossProfit: number;
  sfStatus: string;
  sfSentAt: string | null;
  dataSource: string | null;
};

function formatYen(v: number) {
  return v === 0 ? "¥0" : `¥${v.toLocaleString()}`;
}

export function BillingTable({ rows, yearMonth, sfOrgUrl }: { rows: BillingRow[]; yearMonth: string; sfOrgUrl?: string }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("companyName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let arr = rows.filter((r) => !q || r.companyName.toLowerCase().includes(q));
    arr = [...arr].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol] as string | number ?? "";
      const bv = (b as Record<string, unknown>)[sortCol] as string | number ?? "";
      const an = typeof av === "string" ? av.toLowerCase() : av;
      const bn = typeof bv === "string" ? bv.toLowerCase() : bv;
      if (an < bn) return sortDir === "asc" ? -1 : 1;
      if (an > bn) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, search, sortCol, sortDir]);

  const thCls = "text-left px-4 py-3 font-medium text-gray-600";

  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="会社名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <a
          href={`/api/billing/export?yearMonth=${yearMonth}`}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-input bg-background text-sm text-gray-600 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          全社CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <SortableHeader label="会社名" column="companyName" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="パック" column="totalPackPrice" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium text-gray-600" />
              <SortableHeader label="クレジット" column="totalCredit" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium text-gray-600" />
              <SortableHeader label="IP通話料" column="ipCallCharge" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium text-gray-600" />
              <SortableHeader label="超過料金" column="overageCharge" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium text-gray-600" />
              <SortableHeader label="原価" column="rawCost" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium text-gray-600" />
              <SortableHeader label="粗利" column="grossProfit" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium text-gray-600" />
              <SortableHeader label="ステータス" column="sfStatus" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-400">
                  {search ? "該当データがありません" : "データがありません"}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/billing/${yearMonth}/${r.tenantId}`} className="font-medium text-blue-600 hover:underline">
                    {r.companyName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right">{formatYen(r.totalPackPrice)}</td>
                <td className="px-4 py-3 text-right text-green-700">{formatYen(r.totalCredit)}</td>
                <td className="px-4 py-3 text-right">{formatYen(r.ipCallCharge)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={r.overageCharge > 0 ? "text-red-600 font-medium" : "text-gray-400"}>
                    {formatYen(r.overageCharge)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-500">{formatYen(r.rawCost)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={r.grossProfit >= 0 ? "text-green-700" : "text-red-600"}>
                    {formatYen(r.grossProfit)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      r.sfStatus === "送信済" ? "default"
                      : r.sfStatus === "未送信" ? "secondary"
                      : r.sfStatus === "エラー" ? "destructive"
                      : "outline"
                    }
                  >
                    {r.sfStatus}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {r.sfStatus === "未送信" && (
                      <SendSfButton
                        tenants={[{ tenantId: r.tenantId, companyName: r.companyName }]}
                        yearMonth={yearMonth}
                      />
                    )}
                    {r.sfOpportunityId && (
                      sfOrgUrl ? (
                        <a
                          href={`${sfOrgUrl}/${r.sfOpportunityId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline font-mono whitespace-nowrap"
                        >
                          {r.sfOpportunityId} →
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400 font-mono">{r.sfOpportunityId}</span>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <p className="text-xs text-gray-400 px-4 py-2">{filtered.length}件表示</p>
        )}
      </div>
    </>
  );
}
