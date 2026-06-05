"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatYen } from "@/lib/format";
import { Send, Loader2 } from "lucide-react";

export type PendingRow = {
  id: string;
  yearMonth: string;
  tenantId: string;
  companyName: string;
  slug: string;
  sfOpportunityId: string | null;
  overageTotal: number;
  sfStatus: string;
  sfErrorMessage: string | null;
};

const EXCLUDE_KEYWORDS = ["在庫", "社内", "デモ", "テスト"] as const;

export function SfPendingClient({ rows }: { rows: PendingRow[] }) {
  const [search, setSearch] = useState("");
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [showNoSf, setShowNoSf] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [excluding, setExcluding] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sendResults, setSendResults] = useState<Record<string, "ok" | "error">>({});

  const noSfCount = rows.filter((r) => !r.sfOpportunityId).length;
  const totalAmount = rows.reduce((s, r) => s + r.overageTotal, 0);

  const filtered = rows.filter((r) => {
    if (showNoSf && r.sfOpportunityId) return false;
    if (activeKeyword && !r.companyName.includes(activeKeyword)) return false;
    if (search && !r.companyName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // 月別グループ（新しい月順）
  const byMonth = filtered.reduce<Record<string, PendingRow[]>>((acc, r) => {
    (acc[r.yearMonth] ??= []).push(r);
    return acc;
  }, {});
  const months = Object.keys(byMonth).sort().reverse();

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMonthAll(monthRows: PendingRow[]) {
    const allChecked = monthRows.every((r) => checked.has(r.id));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) monthRows.forEach((r) => next.delete(r.id));
      else monthRows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function selectAll() {
    setChecked(new Set(filtered.map((r) => r.id)));
  }

  function clearAll() {
    setChecked(new Set());
  }

  async function handleExclude() {
    setExcluding(true);
    try {
      await fetch("/api/mobile/billing-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageIds: Array.from(checked), status: "対応不要" }),
      });
      window.location.reload();
    } finally {
      setExcluding(false);
    }
  }

  async function handleSend(usageId: string) {
    setSendResults((prev) => { const next = { ...prev }; delete next[usageId]; return next; });
    setSending(usageId);
    try {
      const res = await fetch("/api/mobile/send-sf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageIds: [usageId] }),
      });
      if (res.ok) {
        setSendResults((prev) => ({ ...prev, [usageId]: "ok" }));
        setTimeout(() => window.location.reload(), 800);
      } else {
        setSendResults((prev) => ({ ...prev, [usageId]: "error" }));
      }
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* サマリー */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">未送信合計</p>
            <p className="text-2xl font-bold text-amber-600">{rows.length} 件</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">SF連携なし</p>
            <p className="text-2xl font-bold text-gray-400">{noSfCount} 件</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">総超過金額</p>
            <p className="text-2xl font-bold">{formatYen(totalAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="会社名で検索..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setActiveKeyword(null); }}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={() => { setShowNoSf(!showNoSf); setActiveKeyword(null); setSearch(""); }}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            showNoSf ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          SF連携なしのみ
        </button>
        <span className="text-xs text-gray-400 pl-1">キーワード絞込：</span>
        {EXCLUDE_KEYWORDS.map((kw) => (
          <button
            key={kw}
            onClick={() => { setActiveKeyword(activeKeyword === kw ? null : kw); setSearch(""); setShowNoSf(false); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeKeyword === kw
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {kw}
          </button>
        ))}
        {(search || activeKeyword || showNoSf) && (
          <button
            onClick={() => { setSearch(""); setActiveKeyword(null); setShowNoSf(false); }}
            className="text-xs text-blue-600 hover:underline"
          >
            クリア
          </button>
        )}
      </div>

      {/* 一括操作バー */}
      {checked.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg border">
          <span className="text-sm text-gray-700 font-medium">{checked.size}件選択中</span>
          <Button size="sm" variant="outline" onClick={handleExclude} disabled={excluding}>
            {excluding ? "処理中..." : "対応不要にする"}
          </Button>
          <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-600 ml-auto">
            選択解除
          </button>
        </div>
      )}

      {/* テーブル（月別グループ） */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-gray-400 text-sm">
            未送信のレコードはありません
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-gray-400 text-sm">
            検索条件に一致するレコードがありません
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">
              表示中 {filtered.length}件を全選択
            </button>
          </div>
          {months.map((month) => {
            const monthRows = byMonth[month];
            const [y, m] = month.split("-").map(Number);
            const monthTotal = monthRows.reduce((s, r) => s + r.overageTotal, 0);
            const allMonthChecked = monthRows.every((r) => checked.has(r.id));
            return (
              <Card key={month}>
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between rounded-t-xl">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {y}年{m}月利用分
                    <span className="text-gray-400 font-normal ml-2 text-xs">{monthRows.length}件</span>
                  </h3>
                  <span className="text-sm font-medium text-gray-700">{formatYen(monthTotal)}</span>
                </div>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-white">
                        <th className="px-4 py-2 w-8">
                          <input
                            type="checkbox"
                            checked={allMonthChecked}
                            onChange={() => toggleMonthAll(monthRows)}
                            className="rounded"
                          />
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">会社名</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">取引先コード</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">SF商談ID</th>
                        <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">超過合計</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">ステータス</th>
                        <th className="px-4 py-2 w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {monthRows.map((r) => (
                        <tr key={r.id} className={`border-b hover:bg-gray-50 ${checked.has(r.id) ? "bg-blue-50" : ""}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={checked.has(r.id)}
                              onChange={() => toggleCheck(r.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800">{r.companyName}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.slug}</td>
                          <td className="px-4 py-3">
                            {r.sfOpportunityId ? (
                              <span className="font-mono text-xs text-gray-500">{r.sfOpportunityId}</span>
                            ) : (
                              <Badge variant="outline" className="text-gray-400 text-xs border-gray-300">
                                SF連携なし
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            <span className={r.overageTotal > 0 ? "text-red-600" : "text-gray-400"}>
                              {formatYen(r.overageTotal)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <Badge variant={r.sfStatus === "エラー" ? "destructive" : "secondary"} className="w-fit">
                                {r.sfStatus}
                              </Badge>
                              {r.sfErrorMessage && (
                                <p className="text-xs text-red-500 max-w-48 truncate" title={r.sfErrorMessage}>
                                  {r.sfErrorMessage}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {sendResults[r.id] === "ok" ? (
                              <span className="text-xs text-green-600 font-medium">✓ 送信完了</span>
                            ) : sendResults[r.id] === "error" ? (
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-xs text-red-600">送信失敗</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSend(r.id)}
                                  disabled={sending === r.id}
                                  className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
                                >
                                  {sending === r.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <><Send className="h-3 w-3 mr-1" />再送信</>
                                  )}
                                </Button>
                              </div>
                            ) : r.sfOpportunityId && r.overageTotal > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSend(r.id)}
                                disabled={sending === r.id}
                                className="h-7 text-xs"
                              >
                                {sending === r.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><Send className="h-3 w-3 mr-1" />SF送信</>
                                )}
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
