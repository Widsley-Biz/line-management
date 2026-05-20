"use client";
import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, PackageCheck, PackageX } from "lucide-react";
import { formatYen } from "@/lib/format";

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

export function DevicesTable({
  rows,
  yearMonth,
}: {
  rows: PhoneRow[];
  yearMonth: string;
}) {
  const [search, setSearch] = useState("");
  const [returnedFilter, setReturnedFilter] = useState<"all" | "returned" | "unreturned" | "noreturn">("all");
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
    return rows.filter((r) => {
      const matchSearch =
        !q ||
        r.phoneNumber.includes(q) ||
        r.companyName.toLowerCase().includes(q) ||
        r.items.some((i) => i.itemName.toLowerCase().includes(q));

      const matchReturned =
        returnedFilter === "all" ||
        (returnedFilter === "returned" && r.deviceReturned === 1) ||
        (returnedFilter === "noreturn" && r.deviceReturned === 2) ||
        (returnedFilter === "unreturned" && r.deviceReturned === 0);

      return matchSearch && matchReturned;
    });
  }, [rows, search, returnedFilter]);

  function DeviceReturnedBadge({ value }: { value: number }) {
    if (value === 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <PackageCheck className="h-3 w-3" />回収済
        </span>
      );
    }
    if (value === 2) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          <PackageCheck className="h-3 w-3" />回収不要
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        <PackageX className="h-3 w-3" />未回収
      </span>
    );
  }

  return (
    <>
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="携帯番号・会社名・項目名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={returnedFilter}
          onChange={(e) => setReturnedFilter(e.target.value as "all" | "returned" | "unreturned" | "noreturn")}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">回収状況：すべて</option>
          <option value="unreturned">未回収のみ</option>
          <option value="returned">回収済のみ</option>
          <option value="noreturn">回収不要のみ</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-8"></th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">携帯番号</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">会社名</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">契約開始日</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">契約終了日</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">端末回収</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">超過合計</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400">
                  {search || returnedFilter !== "all"
                    ? "条件に一致するデータがありません"
                    : "データがありません"}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <>
                <tr
                  key={r.phoneNumber}
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
                  <td className="px-4 py-3 text-gray-700">{r.companyName}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {r.contractStart ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.contractEnd ? (
                      <span className="text-amber-600 font-medium">{r.contractEnd}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <DeviceReturnedBadge value={r.deviceReturned} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">
                    {formatYen(r.overageTotal)}
                  </td>
                </tr>
                {expanded.has(r.phoneNumber) && (
                  <tr key={`${r.phoneNumber}-detail`} className="border-b bg-gray-50">
                    <td colSpan={7} className="px-8 py-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1 text-gray-500">超過項目</th>
                            <th className="text-right py-1 text-gray-500">金額</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.items.map((item, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-1 text-gray-700">{item.itemName}</td>
                              <td className="py-1 text-right text-red-600">
                                {formatYen(item.amount)}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-medium">
                            <td className="py-1 text-gray-700">合計</td>
                            <td className="py-1 text-right text-red-600">
                              {formatYen(r.overageTotal)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
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