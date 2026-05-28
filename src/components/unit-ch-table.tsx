"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { SortableHeader } from "@/components/sortable-header";
import { GitBranch, Search } from "lucide-react";

type UnitChRow = {
  id: string;
  tenantId: string;
  companyName: string;
  phoneNumber: string;
  billingCode: string;
  allocatedCh: number;
  freeCall: string | null;
  startMonth: string;
  endMonth: string | null;
  unitChStatus: string;
  unitChNotes: string | null;
};

interface UnitChTableProps {
  rows: UnitChRow[];
  updateAction: (formData: FormData) => Promise<void>;
}

export function UnitChTable({ rows, updateAction }: UnitChTableProps) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("unitChStatus");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const statusOrder: Record<string, number> = { "検討中": 0, "対応中": 1, "完了": 2, "不要": 3 };
    let arr = rows.filter(r =>
      !q ||
      r.companyName.toLowerCase().includes(q) ||
      r.phoneNumber.includes(q) ||
      r.billingCode.toLowerCase().includes(q) ||
      (r.freeCall ?? "").includes(q)
    );
    arr = [...arr].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortCol === "unitChStatus") {
        av = statusOrder[a.unitChStatus] ?? 9;
        bv = statusOrder[b.unitChStatus] ?? 9;
      } else {
        av = (a as Record<string, unknown>)[sortCol] as string | number ?? "";
        bv = (b as Record<string, unknown>)[sortCol] as string | number ?? "";
      }
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, search, sortCol, sortDir]);

  const thCls = "text-left px-4 py-3 font-medium text-gray-600";

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="会社名・電話番号・請求IDで検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <SortableHeader label="取引先" column="companyName" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="電話番号" column="phoneNumber" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="請求ID" column="billingCode" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <th className={thCls}>FC番号</th>
              <th className={thCls}>期間</th>
              <SortableHeader label="ユニットchステータス" column="unitChStatus" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <th className="px-4 py-3 text-right font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {search ? "該当データがありません" : "割り当てデータがありません"}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/tenants/${r.tenantId}?tab=assignments`} className="text-blue-600 hover:underline">
                    {r.companyName}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-sm">{r.phoneNumber}</td>
                <td className="px-4 py-3 text-gray-500 text-sm">{r.billingCode}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.freeCall ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {r.startMonth} 〜 {r.endMonth ?? "現在"}
                </td>
                <td className="px-4 py-3" colSpan={2}>
                  <form action={updateAction} className="flex items-center gap-2 justify-end">
                    <input type="hidden" name="assignmentId" value={r.id} />
                    <input
                      name="allocatedCh"
                      type="number"
                      min="0"
                      defaultValue={r.allocatedCh}
                      className="w-16 h-7 rounded border border-input bg-background px-2 text-sm text-right"
                    />
                    <span className="text-xs text-gray-500">ch</span>
                    <select
                      name="unitChStatus"
                      defaultValue={r.unitChStatus}
                      className="h-7 rounded border border-input bg-background px-2 text-xs"
                    >
                      <option value="不要">不要</option>
                      <option value="検討中">検討中</option>
                      <option value="対応中">対応中</option>
                      <option value="完了">完了</option>
                    </select>
                    <button
                      type="submit"
                      className="h-7 px-3 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                    >
                      保存
                    </button>
                  </form>
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
