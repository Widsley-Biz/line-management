"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/sortable-header";
import { Network, Smartphone, Search } from "lucide-react";

type BillingAccountRow = {
  id: string;
  billingCode: string;
  name: string;
  ipAddress: string;
  status: string;
  groupCount: number;
  phoneCount: number;
  totalContractCh: number;
};

type MobileTenantRow = {
  tenantId: string;
  companyName: string;
  totalLines: number;
  activeLines: number;
  status: string;
};

function IpTable({ rows }: { rows: BillingAccountRow[] }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("billingCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let arr = rows.filter(
      (r) =>
        !q ||
        r.billingCode.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.ipAddress.toLowerCase().includes(q)
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
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="請求ID・アカウント名・IPアドレスで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <SortableHeader label="請求ID" column="billingCode" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="アカウント名" column="name" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <th className={thCls}>IPアドレス</th>
              <SortableHeader label="グループ数" column="groupCount" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={`${thCls} text-right`} />
              <SortableHeader label="番号数" column="phoneCount" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={`${thCls} text-right`} />
              <SortableHeader label="契約ch合計" column="totalContractCh" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={`${thCls} text-right`} />
              <th className={thCls}>ステータス</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  <Network className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {search ? "検索する請求アカウントがありません" : "請求アカウントデータがありません"}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/billing-accounts/${r.id}`} className="font-mono text-blue-600 hover:underline">
                    {r.billingCode}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{r.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.ipAddress || "—"}</td>
                <td className="px-4 py-3 text-right">{r.groupCount}</td>
                <td className="px-4 py-3 text-right">{r.phoneCount}</td>
                <td className="px-4 py-3 text-right font-medium">{r.totalContractCh} ch</td>
                <td className="px-4 py-3">
                  <Badge variant={r.status === "active" ? "default" : "secondary"}>
                    {r.status === "active" ? "有効" : "アーカイブ"}
                  </Badge>
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

function MobileTable({ rows }: { rows: MobileTenantRow[] }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("companyName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let arr = rows.filter(
      (r) => !q || r.companyName.toLowerCase().includes(q)
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
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="会社名で検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <SortableHeader label="会社名" column="companyName" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="携帯番号数" column="totalLines" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={`${thCls} text-right`} />
              <SortableHeader label="契約中" column="activeLines" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={`${thCls} text-right`} />
              <th className={thCls}>ステータス</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400">
                  <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {search ? "検索する携帯回線がありません" : "携帯回線データがありません"}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.tenantId} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">{r.companyName}</td>
                <td className="px-4 py-3 text-right">{r.totalLines}</td>
                <td className="px-4 py-3 text-right">{r.activeLines}</td>
                <td className="px-4 py-3">
                  <Badge variant={r.activeLines > 0 ? "default" : "secondary"}>
                    {r.activeLines > 0 ? "契約中" : "解約済"}
                  </Badge>
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

export function BillingAccountsTabs({
  ipRows,
  mobileRows,
}: {
  ipRows: BillingAccountRow[];
  mobileRows: MobileTenantRow[];
}) {
  const [tab, setTab] = useState<"ip" | "mobile">("ip");

  return (
    <div>
      {/* タブ切り替え */}
      <div className="flex gap-1 mb-6 border-b">
        <button
          onClick={() => setTab("ip")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "ip"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Network className="h-4 w-4" />
          IP回線
        </button>
        <button
          onClick={() => setTab("mobile")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "mobile"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Smartphone className="h-4 w-4" />
          携帯回線
        </button>
      </div>

      {tab === "ip" && <IpTable rows={ipRows} />}
      {tab === "mobile" && <MobileTable rows={mobileRows} />}
    </div>
  );
}