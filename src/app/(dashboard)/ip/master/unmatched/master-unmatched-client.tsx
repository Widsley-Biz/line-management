"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TenantCombobox } from "@/components/tenant-combobox";
import { CheckCircle, EyeOff, Trash2 } from "lucide-react";
import { formatJapanesePhoneNumber } from "@/lib/format";

type Row = {
  id: string;
  phoneNumber: string;
  subNumber: string | null;
  attemptedTenantKey: string;
  sourceName: string | null;
  notes: string | null;
  status: string;
};

type Tenant = { id: string; companyName: string };

export function MasterUnmatchedClient({ rows: initial, tenants }: { rows: Row[]; tenants: Tenant[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    return (
      r.phoneNumber.includes(search) ||
      (r.subNumber ?? "").includes(search) ||
      r.attemptedTenantKey.includes(search)
    );
  });

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const ignoredCount = rows.filter((r) => r.status === "ignored").length;
  const checkedIds = Object.keys(checked).filter((id) => checked[id]);
  const allFilteredChecked = filtered.length > 0 && filtered.every((r) => checked[r.id]);

  function toggleAllFiltered() {
    const next = !allFilteredChecked;
    setChecked((prev) => {
      const copy = { ...prev };
      for (const r of filtered) copy[r.id] = next;
      return copy;
    });
  }

  async function handleBulkDelete() {
    if (checkedIds.length === 0) return;
    if (!confirm(`選択した${checkedIds.length}件を削除しますか？（取消できません）`)) return;
    setBulkDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/ip/master/unmatched", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: checkedIds }),
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => !checked[r.id]));
        setChecked({});
      } else {
        const data = await res.json();
        setError(data.error ?? "一括削除に失敗しました");
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleAssign(id: string) {
    const tenantId = selected[id];
    if (!tenantId) return;
    setLoading((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      const res = await fetch("/api/ip/master/unmatched", {
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
      const res = await fetch("/api/ip/master/unmatched", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "ignore" }),
      });
      if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "ignored" } : r)));
    } finally {
      setLoading((p) => ({ ...p, [id]: false }));
    }
  }

  async function handleDelete(id: string) {
    setLoading((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch("/api/ip/master/unmatched", {
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
      <div className="grid grid-cols-2 gap-4">
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
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="電話番号・裏番号・取引先キーで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {checkedIds.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            選択した{checkedIds.length}件を削除
          </Button>
        )}
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
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allFilteredChecked}
                      onChange={toggleAllFiltered}
                      aria-label="全て選択"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">電話番号（表番号）</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">裏番号</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">CSV上の取引先</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">取込元</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">状態</th>
                  <th className="px-4 py-3 font-medium text-gray-600 min-w-64">取引先割当</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isPending = r.status === "pending";
                  return (
                    <tr key={r.id} className={`border-b hover:bg-gray-50 ${r.status === "ignored" ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={!!checked[r.id]}
                          onChange={(e) => setChecked((p) => ({ ...p, [r.id]: e.target.checked }))}
                          aria-label={`${r.phoneNumber}を選択`}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-gray-800">{formatJapanesePhoneNumber(r.phoneNumber)}</td>
                      <td className="px-4 py-3 font-mono text-gray-500">{r.subNumber ? formatJapanesePhoneNumber(r.subNumber) : "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{r.attemptedTenantKey}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-40" title={r.sourceName ?? ""}>
                        {r.sourceName ?? "-"}
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
                              title="割り当てて番号マスタに登録"
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
