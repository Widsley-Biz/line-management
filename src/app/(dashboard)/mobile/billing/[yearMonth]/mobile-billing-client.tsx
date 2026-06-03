"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatYen } from "@/lib/format";
import { Download, Plus, AlertTriangle } from "lucide-react";
import { MobileSendSfButton } from "./send-sf-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type Row = {
  id: string;
  tenantId: string;
  companyName: string;
  totalLines: number;
  overageTotal: number;
  sfStatus: string;
  sfSentAt: string | null;
  sfErrorMessage: string | null;
  importedAt: string | null;
};

function sfStatusBadge(status: string) {
  switch (status) {
    case "未送信": return <Badge variant="secondary">未送信</Badge>;
    case "送信済": return <Badge variant="default">送信済</Badge>;
    case "エラー": return <Badge variant="destructive">エラー</Badge>;
    case "超過なし": return <Badge variant="outline">超過なし</Badge>;
    case "対応不要": return <Badge variant="outline" className="text-gray-400">対応不要</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export function MobileBillingClient({
  rows,
  yearMonth,
}: {
  rows: Row[];
  yearMonth: string;
}) {
  const [tab, setTab] = useState<"all" | "under500">("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [excludeChecked, setExcludeChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 一括送信確認ダイアログ
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingBulkIds, setPendingBulkIds] = useState<string[]>([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // 除外処理
  const [excluding, setExcluding] = useState(false);

  const pendingRows = rows.filter((r) => r.sfStatus === "未送信" || r.sfStatus === "エラー");
  const pendingIds = pendingRows.map((r) => r.id);
  const under500Rows = pendingRows.filter((r) => r.overageTotal > 0 && r.overageTotal < 500);
  const checkedIds = Array.from(checked);
  const totalOverage = rows.reduce((s, r) => s + r.overageTotal, 0);
  const pendingCount = pendingRows.length;

  const baseRows = tab === "under500" ? under500Rows : rows;
  const filtered = baseRows.filter((r) =>
    !search || r.companyName.toLowerCase().includes(search.toLowerCase())
  );

  // 全件タブのチェックボックス（SF送信用）
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

  // 500円未満タブのチェックボックス（除外用）
  function toggleExclude(id: string) {
    setExcludeChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllExclude() {
    if (excludeChecked.size === under500Rows.length) {
      setExcludeChecked(new Set());
    } else {
      setExcludeChecked(new Set(under500Rows.map((r) => r.id)));
    }
  }

  // 対応不要にする
  async function handleExclude() {
    setExcluding(true);
    try {
      await fetch("/api/mobile/billing-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageIds: Array.from(excludeChecked), status: "対応不要" }),
      });
      window.location.reload();
    } finally {
      setExcluding(false);
    }
  }

  // 一括送信（500円未満チェック付き）
  function handleBulkSendClick(ids: string[]) {
    const has500 = ids.some((id) => under500Rows.find((r) => r.id === id));
    setPendingBulkIds(ids);
    if (has500) {
      setConfirmOpen(true);
    } else {
      executeBulkSend(ids);
    }
  }

  async function executeBulkSend(ids: string[]) {
    setBulkSending(true);
    setBulkError(null);
    try {
      const res = await fetch("/api/mobile/send-sf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "送信失敗");
      setConfirmOpen(false);
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBulkSending(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/mobile/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, yearMonth, itemName, amount: parseFloat(amount) }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("サーバーエラーが発生しました。しばらく待ってから再試行してください。");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登録に失敗しました");
      setShowForm(false);
      setPhoneNumber("");
      setItemName("");
      setAmount("");
      window.location.reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  // 500円未満確認ダイアログに表示する行（送信対象の中で500円未満のもの）
  const under500InBulk = under500Rows.filter((r) => pendingBulkIds.includes(r.id));

  return (
    <>
      {/* 500円未満確認ダイアログ */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) { setConfirmOpen(false); setBulkError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              500円未満の請求が含まれています
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-gray-600">以下の取引先は超過料金が500円未満です。SF送信を続けますか？</p>
            <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
              {under500InBulk.map((r) => (
                <div key={r.id} className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-gray-800">{r.companyName}</span>
                  <span className="font-mono text-amber-600 font-medium">{formatYen(r.overageTotal)}</span>
                </div>
              ))}
            </div>
            {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setBulkError(null); }} disabled={bulkSending}>
              キャンセル
            </Button>
            <Button onClick={() => executeBulkSend(pendingBulkIds)} disabled={bulkSending}>
              {bulkSending ? "送信中..." : "確認して送信"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <p className="text-xs text-gray-500">総超過料金</p>
            <p className="text-2xl font-bold">{formatYen(totalOverage)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 手動追加フォーム */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" />
              超過代金 手動追加
            </p>
            <button
              onClick={() => setShowForm(!showForm)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showForm ? "閉じる" : "入力する"}
            </button>
          </div>
          {showForm && (
            <form onSubmit={handleManualSubmit} className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">電話番号 *</label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    let formatted = digits;
                    if (digits.length <= 3) {
                      formatted = digits;
                    } else if (digits.length <= 7) {
                      formatted = digits.slice(0, 3) + "-" + digits.slice(3);
                    } else {
                      formatted = digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7, 11);
                    }
                    setPhoneNumber(formatted);
                  }}
                  required
                  placeholder="例: 090-1234-5678"
                  className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm font-mono"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-gray-500">超過項目 *</label>
                <select
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  required
                  className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">選択してください</option>
                  <option value="通話料　通話定額基本料　対象外通話">通話料　通話定額基本料　対象外通話</option>
                  <option value="通信料　メール（SMS）">通信料　メール（SMS）</option>
                  <option value="通信料　メール（SMS）（他社宛）">通信料　メール（SMS）（他社宛）</option>
                  <option value="通話料　国際電話">通話料　国際電話</option>
                  <option value="通話料　世界対応ケータイ（音声）（日本国内事業者宛）">通話料　世界対応ケータイ（音声）（日本国内事業者宛）</option>
                  <option value="通信料　世界対応ケータイ（SMS）（日本国内事業者宛）">通信料　世界対応ケータイ（SMS）（日本国内事業者宛）</option>
                  <option value="通話料　ドコモ衛星電話宛">通話料　ドコモ衛星電話宛</option>
                  <option value="その他　オートチャージ（快適モード）追加データ１ＧＢ">その他　オートチャージ（快適モード）追加データ１ＧＢ</option>
                  <option value="代行分　SoftBank・ワイモバイルまとめて支払い（Google Play）ご利用分">代行分　Google Play</option>
                  <option value="情報料　SoftBank・ワイモバイルまとめて支払い（デジタルコンテンツ等）ご利用分">情報料　デジタルコンテンツ等</option>
                  <option value="情報料　SoftBank・ワイモバイルまとめて支払い（Apple等）ご利用分">情報料　Apple等</option>
                  <option value="通話料　通信サービス「0570等」">通話料　通信サービス「0570等」</option>
                  <option value="その他">その他</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">金額（円） *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  placeholder="例: 1500"
                  className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
              {formError && (
                <div className="col-span-4 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  {formError}
                </div>
              )}
              <div className="col-span-4 flex gap-2 items-center">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/80 disabled:opacity-50"
                >
                  {isSubmitting ? "登録中..." : "追加して再計算"}
                </button>
                <p className="text-xs text-gray-400">
                  電話番号で取引先を自動紐付けします
                </p>
              </div>
            </form>
          )}
          {!showForm && (
            <p className="text-xs text-gray-400">
              Excelで取り込めなかった超過代金を手動で追加できます
            </p>
          )}
        </CardContent>
      </Card>

      {/* タブ */}
      <div className="flex gap-2">
        {(["all", "under500"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setExcludeChecked(new Set()); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t
                ? t === "under500"
                  ? "bg-amber-500 text-white"
                  : "bg-primary text-primary-foreground"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t === "all"
              ? `全件 (${rows.length})`
              : `500円未満 (${under500Rows.length})`}
          </button>
        ))}
      </div>

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
            <a
              href={"/api/mobile/export?yearMonth=" + yearMonth + "&type=summary"}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-input bg-background text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              全社CSV
            </a>

            {/* 全件タブのボタン */}
            {tab === "all" && (
              <>
                {checkedIds.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => handleBulkSendClick(checkedIds)}
                  >
                    選択{checkedIds.length}件を送信
                  </Button>
                )}
                {pendingCount > 0 && (
                  <Button size="sm" onClick={() => handleBulkSendClick(pendingIds)}>
                    一括SF送信
                  </Button>
                )}
              </>
            )}

            {/* 500円未満タブのボタン */}
            {tab === "under500" && excludeChecked.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleExclude}
                disabled={excluding}
                className="text-gray-600 border-gray-300"
              >
                {excluding ? "処理中..." : `選択${excludeChecked.size}件を対応不要にする`}
              </Button>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              {yearMonth}のデータがありません。インポートを実行してください。
            </p>
          ) : tab === "under500" && under500Rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              500円未満の未送信請求はありません。
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-3 w-8">
                      {tab === "all" ? (
                        <input
                          type="checkbox"
                          checked={checked.size === pendingRows.length && pendingRows.length > 0}
                          onChange={toggleAll}
                          className="rounded"
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={excludeChecked.size === under500Rows.length && under500Rows.length > 0}
                          onChange={toggleAllExclude}
                          className="rounded"
                        />
                      )}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">会社名</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">携帯台数</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">数量</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">超過合計</th>
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
                          {tab === "all" ? (
                            isPending && (
                              <input
                                type="checkbox"
                                checked={checked.has(r.id)}
                                onChange={() => toggleCheck(r.id)}
                                className="rounded"
                              />
                            )
                          ) : (
                            <input
                              type="checkbox"
                              checked={excludeChecked.has(r.id)}
                              onChange={() => toggleExclude(r.id)}
                              className="rounded"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {r.companyName}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {r.totalLines}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">1</td>
                        <td className="px-4 py-3 text-right font-medium">
                          <span className={
                            r.overageTotal > 0 && r.overageTotal < 500
                              ? "text-amber-600"
                              : r.overageTotal > 0
                              ? "text-red-600"
                              : "text-gray-400"
                          }>
                            {formatYen(r.overageTotal)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {sfStatusBadge(r.sfStatus)}
                            {r.sfErrorMessage && (
                              <p className="text-xs text-red-600">{r.sfErrorMessage}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {r.sfSentAt ? r.sfSentAt.slice(0, 16).replace("T", " ") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {tab === "all" && isPending && r.overageTotal > 0 && (
                            <MobileSendSfButton
                              tenantId={r.tenantId}
                              yearMonth={yearMonth}
                            />
                          )}
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
