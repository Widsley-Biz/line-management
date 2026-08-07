"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatYen, formatJstDateTime } from "@/lib/format";
import { readJson } from "@/lib/fetch-json";
import { Download } from "lucide-react";
import { IpSendSfButton } from "./send-sf-button";

type Row = {
  id: string;
  tenantId: string;
  companyName: string;
  sfOpportunityId: string | null;
  fixedAmount: number;
  mobileNaviAmount: number;
  totalAmount: number;
  sfStatus: string;
  sfSentAt: string | null;
  sfErrorMessage: string | null;
  sfNoActionReason: string | null;
  importedAt: string | null;
};

function sfStatusBadge(status: string) {
  switch (status) {
    case "未送信": return <Badge variant="secondary">未送信</Badge>;
    case "送信済": return <Badge variant="default">送信済</Badge>;
    case "エラー": return <Badge variant="destructive">エラー</Badge>;
    case "対応不要": return <Badge variant="outline" className="text-gray-400">対応不要</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export function IpBillingClient({
  rows,
  yearMonth,
}: {
  rows: Row[];
  yearMonth: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  // 保存済みの明細から未送信の請求金額を集計し直す（端数処理のルール変更を反映する用途）
  async function handleRecalc() {
    if (
      !confirm(
        `${yearMonth}の未送信の請求データを、保存済みの明細から集計し直します。\n単価（タリフ）は変更されません。SF送信済みのデータは対象外です。\n実行しますか？`
      )
    ) {
      return;
    }
    setRecalculating(true);
    setBulkError(null);
    try {
      const res = await fetch("/api/ip/billing/recalc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearMonth }),
      });
      const result = await readJson<{ updated: number; changed: number; diff: number }>(res);
      if (!result.ok) {
        setBulkError(result.error);
        setRecalculating(false);
        return;
      }
      const { updated, changed, diff } = result.data;
      alert(
        `再集計しました。\n対象 ${updated}件 / 金額が変わった取引先 ${changed}社 / 差額合計 ${diff >= 0 ? "+" : ""}${diff.toLocaleString()}円`
      );
      window.location.reload();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "再集計に失敗しました");
      setRecalculating(false);
    }
  }

  const pendingRows = rows.filter((r) => r.sfStatus === "未送信" || r.sfStatus === "エラー");
  const pendingIds = pendingRows.map((r) => r.id);
  const checkedIds = Array.from(checked);
  const totalAmount = rows.reduce((s, r) => s + r.totalAmount, 0);
  const pendingCount = pendingRows.length;

  const filtered = rows.filter((r) => {
    if (search && !r.companyName.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && r.sfStatus !== statusFilter) return false;
    return true;
  });

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (checked.size === pendingRows.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(pendingRows.map((r) => r.id)));
    }
  }

  async function executeBulkSend(ids: string[]) {
    setBulkSending(true);
    setBulkError(null);
    try {
      const res = await fetch("/api/ip/send-sf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "送信失敗");
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBulkSending(false);
    }
  }

  return (
    <>
      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">SF送信待ち</p>
            <p className="text-2xl font-bold text-amber-600">{pendingCount} 件</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">総通話料</p>
            <p className="text-2xl font-bold">{formatYen(totalAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {bulkError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {bulkError}
        </div>
      )}

      {/* テーブル */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-40">
              <input
                type="text"
                placeholder="会社名で検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-4 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">ステータス：全件</option>
              <option value="未送信">未送信</option>
              <option value="エラー">エラー</option>
              <option value="送信済">送信済</option>
              <option value="対応不要">対応不要</option>
            </select>
            <a
              href={"/api/ip/export?yearMonth=" + yearMonth + "&type=summary"}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-input bg-background text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              全社CSV
            </a>

            {pendingCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRecalc}
                disabled={recalculating || bulkSending}
                title="保存済みの明細から未送信の請求金額を集計し直します（単価は変更しません）"
              >
                {recalculating ? "再集計中..." : "未送信を再集計"}
              </Button>
            )}

            {checkedIds.length > 0 && (
              <Button
                size="sm"
                onClick={() => executeBulkSend(checkedIds)}
                disabled={bulkSending}
              >
                {bulkSending ? "送信中..." : `選択${checkedIds.length}件を送信`}
              </Button>
            )}
            {pendingCount > 0 && (
              <Button size="sm" onClick={() => executeBulkSend(pendingIds)} disabled={bulkSending}>
                {bulkSending ? "送信中..." : "一括SF送信"}
              </Button>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              {yearMonth}のデータがありません。CDR CSVのインポートを実行してください。
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={checked.size === pendingRows.length && pendingRows.length > 0}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">会社名</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">固定分</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">携帯＋ナビ分</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">合計</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">送信日時</th>
                    <th className="px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isPending = r.sfStatus === "未送信" || r.sfStatus === "エラー";
                    return (
                      <tr key={r.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {isPending && (
                            <input
                              type="checkbox"
                              checked={checked.has(r.id)}
                              onChange={() => toggleCheck(r.id)}
                              className="rounded"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {r.companyName}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {formatYen(r.fixedAmount)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {formatYen(r.mobileNaviAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          <span className={r.totalAmount > 0 ? "text-gray-900" : "text-gray-400"}>
                            {formatYen(r.totalAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {sfStatusBadge(r.sfStatus)}
                            {r.sfErrorMessage && (
                              <p className="text-xs text-red-600">{r.sfErrorMessage}</p>
                            )}
                            {r.sfStatus === "対応不要" && r.sfNoActionReason && (
                              <p className="text-xs text-gray-400 max-w-48 truncate" title={r.sfNoActionReason}>
                                {r.sfNoActionReason}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {formatJstDateTime(r.sfSentAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isPending && r.totalAmount > 0 && (
                              <IpSendSfButton
                                tenantId={r.tenantId}
                                yearMonth={yearMonth}
                              />
                            )}
                            {r.sfOpportunityId && (
                              process.env.NEXT_PUBLIC_SF_ORG_URL ? (
                                <a
                                  href={`${process.env.NEXT_PUBLIC_SF_ORG_URL}/${r.sfOpportunityId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline font-mono whitespace-nowrap"
                                >
                                  {r.sfOpportunityId} →
                                </a>
                              ) : (
                                <span className="text-xs text-gray-400 font-mono">{r.sfOpportunityId}</span>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 px-4 py-2">{filtered.length}件表示</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
