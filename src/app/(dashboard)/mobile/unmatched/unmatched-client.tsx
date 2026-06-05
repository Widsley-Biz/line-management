"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatYen } from "@/lib/format";
import { CheckCircle, EyeOff, Trash2 } from "lucide-react";

type Row = {
  id: string;
  yearMonth: string;
  rawName: string;
  phoneNumber: string | null;
  overageTotal: number;
  itemsJson: string;
  status: string;
};

type Tenant = { id: string; companyName: string };

function parseItems(json: string): Record<string, number> {
  try { return JSON.parse(json); } catch { return {}; }
}

export function UnmatchedClient({ rows: initial, tenants }: { rows: Row[]; tenants: Tenant[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [search, setSearch] = useState("");
  const [yearMonthFilter, setYearMonthFilter] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({}); // id → tenantId
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const months = [...new Set(rows.map((r) => r.yearMonth))].sort().reverse();

  const filtered = rows.filter((r) => {
    if (yearMonthFilter && r.yearMonth !== yearMonthFilter) return false;
    if (search && !r.rawName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const ignoredCount = rows.filter((r) => r.status === "ignored").length;

  async function handleAssign(id: string) {
    const tenantId = selected[id];
    if (!tenantId) return;
    setLoading((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch("/api/mobile/unmatched", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "assign", tenantId }),
      });
      if (res.ok) setRows((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setLoading((p) => ({ ...p, [id]: false }));
    }
  }

  async function handleIgnore(id: string) {
    setLoading((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch("/api/mobile/unmatched", {
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
      const res = await fetch("/api/mobile/unmatched", {
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
            <p className="text-xs text-gray-500">未処理の超過合計</p>
            <p className="text-2xl font-bold">
              {formatYen(rows.filter((r) => r.status === "pending").reduce((s, r) => s + r.overageTotal, 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* フィルター */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="氏名で検索..."
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

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-gray-400 text-sm">
            {rows.length === 0 ? "未照合の行はありません" : "検索条件に一致するレコードがありません"}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">年月</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">氏名（CSV）</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">電話番号</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">課金明細</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">超過合計</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">状態</th>
                  <th className="px-4 py-3 font-medium text-gray-600 min-w-64">取引先割当</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const items = parseItems(r.itemsJson);
                  const itemEntries = Object.entries(items).filter(([, v]) => v > 0);
                  const [y, mo] = r.yearMonth.split("-").map(Number);
                  const isPending = r.status === "pending";
                  return (
                    <tr key={r.id} className={`border-b hover:bg-gray-50 ${r.status === "ignored" ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{y}年{mo}月</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.rawName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.phoneNumber ?? "—"}</td>
                      <td className="px-4 py-3">
                        {itemEntries.length === 0 ? (
                          <span className="text-gray-300 text-xs">なし</span>
                        ) : (
                          <div className="space-y-0.5">
                            {itemEntries.map(([name, amount]) => (
                              <div key={name} className="flex gap-2 text-xs">
                                <span className="text-gray-500 truncate max-w-40" title={name}>{name}</span>
                                <span className="text-gray-700 font-mono ml-auto">{formatYen(amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        <span className={r.overageTotal > 0 ? "text-red-600" : "text-gray-400"}>
                          {formatYen(r.overageTotal)}
                        </span>
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
                            <select
                              value={selected[r.id] ?? ""}
                              onChange={(e) => setSelected((p) => ({ ...p, [r.id]: e.target.value }))}
                              className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none"
                            >
                              <option value="">取引先を選択...</option>
                              {tenants.map((t) => (
                                <option key={t.id} value={t.id}>{t.companyName}</option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleAssign(r.id)}
                              disabled={!selected[r.id] || loading[r.id]}
                              title="割り当てて請求に反映"
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
