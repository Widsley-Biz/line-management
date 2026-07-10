"use client";
import { useState, useMemo, Fragment } from "react";
import { Search, ChevronDown, ChevronRight, Building2, Network, TrendingUp, Download } from "lucide-react";
import { formatYen, formatSeconds } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";

type NumberRow = {
  phoneNumber: string;
  subNumber: string | null;
  status: string | null;
  tenantId: string;
  companyName: string;
  items: { callCategory: string; callTypeName: string; totalSeconds: number; amount: number }[];
  totalAmount: number;
};

export function NumbersTable({
  rows,
  yearMonth,
}: {
  rows: NumberRow[];
  yearMonth: string;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(phone: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        !q ||
        r.phoneNumber.includes(q) ||
        (r.subNumber ?? "").includes(q) ||
        r.companyName.toLowerCase().includes(q) ||
        r.items.some((i) => i.callTypeName.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const uniqueCompanies = useMemo(
    () => new Set(filtered.map((r) => r.tenantId)).size,
    [filtered]
  );
  const totalAmountFiltered = useMemo(
    () => filtered.reduce((s, r) => s + r.totalAmount, 0),
    [filtered]
  );

  return (
    <>
      {/* ヘッダーカード（検索連動） */}
      <div className="grid grid-cols-3 gap-4 px-4 pt-4 pb-2">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Building2 className="h-3.5 w-3.5" />
              取引先数
            </div>
            <p className="text-2xl font-bold">{uniqueCompanies} <span className="text-sm font-normal text-gray-400">社</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Network className="h-3.5 w-3.5" />
              利用番号数
            </div>
            <p className="text-2xl font-bold">{filtered.length} <span className="text-sm font-normal text-gray-400">件</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              通話料
            </div>
            <p className="text-2xl font-bold text-blue-600">{formatYen(totalAmountFiltered)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 pt-2 pb-2 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="電話番号・裏番号・会社名・通話種別で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <a
          href={"/api/ip/export?yearMonth=" + yearMonth + "&type=numbers"}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-input bg-background text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap"
        >
          <Download className="h-4 w-4" />
          CSVエクスポート
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-8"></th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">電話番号</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">裏番号</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">会社名</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">通話料合計</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400">
                  {search ? "条件に一致するデータがありません" : "データがありません"}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <Fragment key={r.phoneNumber}>
                <tr
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleExpand(r.phoneNumber)}
                >
                  <td className="px-4 py-3 text-gray-400">
                    {expanded.has(r.phoneNumber) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">{r.phoneNumber}</td>
                  <td className="px-4 py-3 font-mono text-gray-500">{r.subNumber ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-700">{r.companyName}</td>
                  <td className="px-4 py-3">
                    {r.status ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === "契約中" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {r.status}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-blue-600">
                    {formatYen(r.totalAmount)}
                  </td>
                </tr>
                {expanded.has(r.phoneNumber) && (
                  <tr className="border-b bg-gray-50">
                    <td colSpan={6} className="px-8 py-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1 text-gray-500">課金区分</th>
                            <th className="text-left py-1 text-gray-500">通話種別名称</th>
                            <th className="text-right py-1 text-gray-500">通話時間</th>
                            <th className="text-right py-1 text-gray-500">金額</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.items.map((item, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-1 text-gray-700">{item.callCategory}</td>
                              <td className="py-1 text-gray-700">{item.callTypeName}</td>
                              <td className="py-1 text-right text-gray-500">
                                {item.totalSeconds > 0 ? formatSeconds(item.totalSeconds) : "-"}
                              </td>
                              <td className="py-1 text-right text-blue-600">
                                {formatYen(item.amount)}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-medium">
                            <td colSpan={3} className="py-1 text-gray-700">合計</td>
                            <td className="py-1 text-right text-blue-600">
                              {formatYen(r.totalAmount)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
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
