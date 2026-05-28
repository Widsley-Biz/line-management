"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/sortable-header";
import { Users, Search } from "lucide-react";

type TenantRow = {
  id: string;
  slug: string;
  companyName: string;
  status: string;
  assigneeName: string | null;
  packCount: number;
  allocatedCh: number;
};

export function TenantsTable({ rows }: { rows: TenantRow[] }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("companyName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let arr = rows.filter(t =>
      !q ||
      t.companyName.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      (t.assigneeName ?? "").toLowerCase().includes(q)
    );
    arr = [...arr].sort((a, b) => {
      let av: string | number = (a as Record<string, unknown>)[sortCol] as string | number ?? "";
      let bv: string | number = (b as Record<string, unknown>)[sortCol] as string | number ?? "";
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
          placeholder="会社名・取引先コード・担当者で検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <SortableHeader label="会社名" column="companyName" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="取引先コード" column="slug" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="担当者" column="assigneeName" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="ステータス" column="status" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="パック数" column="packCount" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={`${thCls} text-right`} />
              <SortableHeader label="割り当てch" column="allocatedCh" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={`${thCls} text-right`} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {search ? "該当する取引先がありません" : "取引先データがありません"}
                </td>
              </tr>
            )}
            {filtered.map((t) => (
              <tr key={t.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/tenants/${t.id}`} className="font-medium text-blue-600 hover:underline">
                    {t.companyName}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-gray-500 text-xs">{t.slug}</td>
                <td className="px-4 py-3 text-gray-600">{t.assigneeName ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={t.status === "active" ? "default" : "secondary"}>
                    {t.status === "active" ? "有効" : "解約"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">{t.packCount}</td>
                <td className="px-4 py-3 text-right">{t.allocatedCh} ch</td>
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
