"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSeconds } from "@/lib/format";
import { TenantCombobox } from "@/components/tenant-combobox";
import { CheckCircle, EyeOff, Trash2 } from "lucide-react";

type UnmatchedItem = { category: string; seconds: number; amount: number };

type Row = {
  id: string;
  yearMonth: string;
  phoneNumber: string;
  itemsJson: string;
  totalSeconds: number;
  status: string;
};

type Tenant = { id: string; companyName: string };

function parseItems(json: string): Record<string, UnmatchedItem> {
  try { return JSON.parse(json); } catch { return {}; }
}

export function UnmatchedClient({ rows: initial, tenants }: { rows: Row[]; tenants: Tenant[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [search, setSearch] = useState("");
  const [yearMonthFilter, setYearMonthFilter] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({}); // id → tenantId
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const months = [...new Set(rows.map((r) => r.yearMonth))].sort().reverse();

  const filtered = rows.filter((r) => {
    if (yearMonthFilter && r.yearMonth !== yearMonthFilter) return false;
    if (search && !r.phoneNumber.includes(search)) return false;
    return true;
  });

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const ignoredCount = rows.filter((r) => r.status === "ignored").length;
  const pendingSeconds = rows
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + r.totalSeconds, 0);

  async function handleAssign(id: string) {
    const tenantId = selected[id];
    if (!tenantId) return;
    setLoading((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      const res = await fetch("/api/ip/unmatched", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "assign", tenantId }),
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
      } else {
        const data = await res.json();
        setError(data.error ?? "割当に失敗しました");
      }
    } finally {
      setLoading((p) => ({ ...p, [id]: false }));
    }
  }

  async function handleIgnore(id: string) {
    setLoading((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch("/api/ip/unmatched", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "ignore" }),
      });
      if (res.ok) setRows((prev) => prev.map((r) => r.id === id ? { ...r, status: "ignored" } : r));
    } finally {
      setLoading((p) => ({ ...p, [id]: false }));
    }
  }

  async function handleDelete(id: string) {
    setLoading((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch("/api/ip/unmatched", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setRows((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setLoading((p) => ({ ...p, [id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {/* サマリー */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">未処理</p>
            <p className="text-2xl font-bold text-amber-600">{pendingCount} 件</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">無視済み</p>
            <p className="text-2xl font-bold text-gray-400">{ignoredCount} 件</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">未処理の通話時間合計</p>
            <p className="text-2xl font-bold">{formatSeconds(pendingSeconds)}</p>
          </CardContent>
        </Card>
      </div>

      {/* フィルター */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="電話番号で検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <select
          value={yearMonthFilter}
          onChange={(e) => setYearMonthFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none"
        >
          <option value="">全月</option>
          {months.map((m) => {
            const [y, mo] = m.split("-").map(Number);
            return <option key={m} value={m}>{y}年{mo}月</option>;
          })}
        </select>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-gray-400 text-sm">
            {rows.length === 0 ? "未照合の番号はありません" : "検索条件に一致するレコードがありません"}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">利用月</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">ご利用番号（CDR）</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">通話明細</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">通話時間合計</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">状態</th>
                  <th className="px-4 py-3 font-medium text-gray-600 min-w-64">取引先割当</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const items = parseItems(r.itemsJson);
                  const itemEntries = Object.entries(items);
                  const [y, mo] = r.yearMonth.split("-").map(Number);
                  const isPending = r.status === "pending";
                  return (
                    <tr key={r.id} className={`border-b hover:bg-gray-50 ${r.status === "ignored" ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{y}年{mo}月</td>
                      <td className="px-4 py-3 font-mono font-medium text-gray-800">{r.phoneNumber}</td>
                      <td className="px-4 py-3">
                        {itemEntries.length === 0 ? (
                          <span className="text-gray-300 text-xs">なし</span>
                        ) : (
                          <div className="space-y-0.5">
                            {itemEntries.map(([name, item]) => (
                              <div key={name} className="flex gap-2 text-xs">
                                <Badge variant="outline" className="text-[10px] px-1 py-0 text-gray-500">
                                  {item.category}
                                </Badge>
                                <span className="text-gray-500 truncate max-w-40" title={name}>{name}</span>
                                <span className="text-gray-700 font-mono ml-auto">
                                  {item.category === "ナビ金額"
                                    ? `¥${item.amount}`
                                    : formatSeconds(item.seconds)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">
                        {formatSeconds(r.totalSeconds)}
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "pending" ? (
                          <Badge variant="secondary">未処理</Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-400">無視</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPending && (
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <TenantCombobox
                                tenants={tenants}
                                placeholder="取引先を検索..."
                                onChange={(t) => setSelected((p) => ({ ...p, [r.id]: t?.id ?? "" }))}
                              />
                            </div>
                            <Button
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleAssign(r.id)}
                              disabled={!selected[r.id] || loading[r.id]}
                              title="割り当てて請求に反映（番号マスタにも登録）"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          {isPending && (
                            <button
                              onClick={() => handleIgnore(r.id)}
                              disabled={loading[r.id]}
                              className="text-gray-300 hover:text-gray-500 transition-colors"
                              title="無視する"
                            >
                              <EyeOff className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(r.id)}
                            disabled={loading[r.id]}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                            title="削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 px-4 py-2">{filtered.length}件表示</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
