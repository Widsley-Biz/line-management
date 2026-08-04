"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatYen } from "@/lib/format";
import { TenantCombobox } from "@/components/tenant-combobox";
import { AlertTriangle, CheckCircle, EyeOff, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

function formatMonth(yearMonth: string): string {
  const [y, mo] = yearMonth.split("-").map(Number);
  return `${y}年${mo}月`;
}

export function UnmatchedClient({ rows: initial, tenants }: { rows: Row[]; tenants: Tenant[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [search, setSearch] = useState("");
  const [yearMonthFilter, setYearMonthFilter] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({}); // id → tenantId
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const months = [...new Set(rows.map((r) => r.yearMonth))].sort().reverse();

  const filtered = rows.filter((r) => {
    if (yearMonthFilter && r.yearMonth !== yearMonthFilter) return false;
    if (search && !r.rawName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const ignoredCount = rows.filter((r) => r.status === "ignored").length;

  // 選択行は rows から引き直す（絞り込み変更や削除済みの id が混ざらないようにする）
  const checkedRows = rows.filter((r) => checked[r.id]);
  const checkedIds = checkedRows.map((r) => r.id);
  const allFilteredChecked =
    filtered.length > 0 && filtered.every((r) => checked[r.id]);

  // 確認ポップアップ用: 選択行の利用年月ごとの件数・超過金額
  const checkedByMonth = [
    ...checkedRows
      .reduce((map, r) => {
        const cur = map.get(r.yearMonth) ?? { count: 0, total: 0 };
        map.set(r.yearMonth, {
          count: cur.count + 1,
          total: cur.total + r.overageTotal,
        });
        return map;
      }, new Map<string, { count: number; total: number }>())
      .entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  const checkedTotal = checkedRows.reduce((s, r) => s + r.overageTotal, 0);
  // マイナス（ご返金）も請求に影響するため「金額あり」として扱う
  const checkedWithAmount = checkedRows.filter((r) => r.overageTotal !== 0).length;

  // 現在の絞り込み対象をまとめて選択／解除する（月で絞ってから全選択する運用）
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
    setBulkDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/mobile/unmatched", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: checkedIds }),
      });
      if (res.ok) {
        const deletedIds = new Set(checkedIds);
        setRows((prev) => prev.filter((r) => !deletedIds.has(r.id)));
        setChecked({});
        setConfirmOpen(false);
      } else {
        const data = await res.json();
        setError(data.error ?? "一括削除に失敗しました");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "一括削除に失敗しました");
    } finally {
      setBulkDeleting(false);
    }
  }

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
      {/* 一括削除の確認ポップアップ */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!bulkDeleting) setConfirmOpen(o); }}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              未照合レコードの削除
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-gray-500">削除件数</p>
                <p className="text-2xl font-bold text-red-600">{checkedIds.length} 件</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-gray-500">超過金額の合計</p>
                <p className="text-2xl font-bold">{formatYen(checkedTotal)}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">対象利用年月の内訳</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-left py-1.5 font-medium">利用年月</th>
                    <th className="text-right py-1.5 font-medium">件数</th>
                    <th className="text-right py-1.5 font-medium">超過金額</th>
                  </tr>
                </thead>
                <tbody>
                  {checkedByMonth.map(([ym, v]) => (
                    <tr key={ym} className="border-b last:border-0">
                      <td className="py-1.5 text-gray-700">{formatMonth(ym)}</td>
                      <td className="py-1.5 text-right text-gray-700">{v.count} 件</td>
                      <td className={`py-1.5 text-right font-mono ${v.total > 0 ? "text-red-600" : v.total < 0 ? "text-blue-600" : "text-gray-400"}`}>
                        {formatYen(v.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {checkedWithAmount > 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                金額が入っているレコード（ご返金などのマイナスを含む）が <span className="font-bold">{checkedWithAmount}件</span> 含まれています。
                削除すると取引先へ割り当てられなくなり、この金額は請求に反映されません。
                本当に削除してよいか確認してください。
              </div>
            ) : (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                選択したレコードはすべて超過金額が0円です。削除しても請求金額には影響しません。
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">
                削除対象（氏名／CSV上の値）
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border bg-gray-50 p-2 space-y-0.5">
                {checkedRows.slice(0, 50).map((r) => (
                  <p key={r.id} className="text-xs text-gray-700 flex gap-2">
                    <span className="text-gray-400 shrink-0">{formatMonth(r.yearMonth)}</span>
                    <span className="truncate">{r.rawName || "（空欄）"}</span>
                    <span className="ml-auto font-mono text-gray-500 shrink-0">{formatYen(r.overageTotal)}</span>
                  </p>
                ))}
                {checkedRows.length > 50 && (
                  <p className="text-xs text-gray-400 pt-1">他 {checkedRows.length - 50} 件</p>
                )}
              </div>
            </div>

            <p className="text-xs text-red-600 font-medium">この操作は取り消せません。</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={bulkDeleting}>
              キャンセル
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {checkedIds.length}件を削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          {months.map((m) => (
            <option key={m} value={m}>{formatMonth(m)}</option>
          ))}
        </select>
        {checkedIds.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50"
            onClick={() => setConfirmOpen(true)}
            disabled={bulkDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            選択した{checkedIds.length}件を削除
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

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
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allFilteredChecked}
                      onChange={toggleAllFiltered}
                      aria-label={yearMonthFilter ? `${formatMonth(yearMonthFilter)}の表示中の行を全て選択` : "表示中の行を全て選択"}
                      title={yearMonthFilter ? `${formatMonth(yearMonthFilter)}の表示中${filtered.length}件を全て選択` : `表示中${filtered.length}件を全て選択`}
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">利用年月</th>
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
                  // マイナス（ご返金・調整）も表示対象にする
                  const itemEntries = Object.entries(items).filter(([, v]) => v !== 0);
                  const [y, mo] = r.yearMonth.split("-").map(Number);
                  const isPending = r.status === "pending";
                  return (
                    <tr key={r.id} className={`border-b hover:bg-gray-50 ${checked[r.id] ? "bg-red-50/40" : ""} ${r.status === "ignored" ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={!!checked[r.id]}
                          onChange={(e) => setChecked((p) => ({ ...p, [r.id]: e.target.checked }))}
                          aria-label={`${r.rawName || "空欄"}を選択`}
                        />
                      </td>
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
                        <span className={r.overageTotal > 0 ? "text-red-600" : r.overageTotal < 0 ? "text-blue-600" : "text-gray-400"}>
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
            <p className="text-xs text-gray-400 px-4 py-2">
              {filtered.length}件表示
              {checkedIds.length > 0 && `（${checkedIds.length}件選択中）`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
