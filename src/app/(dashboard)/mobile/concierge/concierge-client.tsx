"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TenantCombobox } from "@/components/tenant-combobox";
import { readJson } from "@/lib/fetch-json";
import { formatJstDateTime } from "@/lib/format";
import {
  DIFF_TYPE_LABELS,
  DIFF_TYPE_HINTS,
  DIFF_STATUS_LABELS,
  DIRECTION_LABELS,
  RUN_STATUS_LABELS,
  RUN_TYPE_LABELS,
} from "@/lib/concierge/labels";
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Row = {
  id: string;
  direction: string;
  diffType: string;
  phoneKey: string;
  phoneNumber: string;
  mobileLineId: string | null;
  tenantId: string | null;
  field: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  baseConciergeValue: string | null;
  status: string;
  note: string | null;
  errorMessage: string | null;
  createdAt: string;
  contactName: string | null;
  imei: string | null;
  iccid: string | null;
  suggestedTenantId: string | null;
};

type Tenant = { id: string; companyName: string };

type Run = {
  id: string;
  runType: string;
  status: string;
  queuedAt: string;
  finishedAt: string | null;
  linesSeen: number;
  diffsCreated: number;
  errorMessage: string | null;
};

const TYPE_ORDER = [
  "line_added",
  "number_changed",
  "imei_changed",
  "iccid_changed",
  "name_mismatch",
  "line_removed",
];

export function ConciergeClient({
  rows,
  tenants,
  total,
  page,
  pageSize,
  filters,
  typeCounts,
  statusCounts,
  companyCounts,
  lastRun,
  mirror,
}: {
  rows: Row[];
  tenants: Tenant[];
  total: number;
  page: number;
  pageSize: number;
  filters: { status: string; type: string; q: string; company: string };
  typeCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  companyCounts: { name: string; n: number }[];
  lastRun: Run | null;
  mirror: { count: number; observedAt: string | null; source: string | null };
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  /** ページをまたいで選択したID（「検索結果をすべて選択」で使う） */
  const [extraIds, setExtraIds] = useState<string[] | null>(null);
  const [bulkTenantId, setBulkTenantId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "approve" | "reject">(null);
  const [q, setQ] = useState(filters.q);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const checkedRows = rows.filter((r) => checked[r.id]);
  const allChecked = rows.length > 0 && rows.every((r) => checked[r.id]);

  /** 実際に送るID。ページ跨ぎ選択があればそちらを優先する */
  const targetIds = extraIds ?? checkedRows.map((r) => r.id);
  const targetCount = targetIds.length;

  // 新規開通が含まれるなら取引先の指定が要る。
  // 1回の承認で指定できる取引先は1つなので、会社名で絞ってから一括で割り当てる運用。
  const hasLineAdded = extraIds
    ? filters.type === "line_added" || rows.some((r) => checked[r.id] && r.diffType === "line_added")
    : checkedRows.some((r) => r.diffType === "line_added");

  const suggestion = useMemo(() => {
    const s = new Set(
      (extraIds ? rows : checkedRows)
        .filter((r) => r.diffType === "line_added" && r.suggestedTenantId)
        .map((r) => r.suggestedTenantId as string)
    );
    return s.size === 1 ? [...s][0] : "";
  }, [rows, checkedRows, extraIds]);

  const effectiveTenantId = bulkTenantId || suggestion;
  const needsTenant = hasLineAdded && !effectiveTenantId;

  function navigate(
    next: Partial<{ page: number; status: string; type: string; q: string; company: string }>
  ) {
    const params = new URLSearchParams();
    const merged = { page, ...filters, ...next };
    if (merged.page && merged.page > 1) params.set("page", String(merged.page));
    if (merged.status && merged.status !== "pending") params.set("status", merged.status);
    if (merged.type) params.set("type", merged.type);
    if (merged.q) params.set("q", merged.q);
    if (merged.company) params.set("company", merged.company);
    setChecked({});
    setExtraIds(null);
    router.push(`/mobile/concierge${params.toString() ? `?${params}` : ""}`);
  }

  async function selectAllMatching() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ mode: "ids", status: filters.status });
      if (filters.type) params.set("type", filters.type);
      if (filters.q) params.set("q", filters.q);
      if (filters.company) params.set("company", filters.company);
      const res = await fetch(`/api/concierge/diffs?${params}`);
      const json = await readJson<{ ids: string[]; capped: boolean; max: number }>(res);
      if (!json.ok) {
        setError(json.error);
        return;
      }
      setExtraIds(json.data.ids);
      const copy: Record<string, boolean> = {};
      for (const r of rows) copy[r.id] = true;
      setChecked(copy);
      if (json.data.capped) {
        setError(`一度に選択できるのは${json.data.max}件までのため、先頭${json.data.max}件を選択しました`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit(action: "approve" | "reject") {
    setConfirm(null);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/concierge/diffs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ids: targetIds,
          tenantId: effectiveTenantId || undefined,
        }),
      });
      const json = await readJson<{ success: number; skipped: number; errors: string[] }>(res);
      if (!json.ok) {
        setError(json.error);
        return;
      }
      const data = json.data;
      setResult(
        `${action === "approve" ? "承認" : "却下"} ${data.success}件${
          data.skipped ? ` / 処理済のためスキップ ${data.skipped}件` : ""
        }`
      );
      if (data.errors?.length) setError(data.errors.slice(0, 5).join("\n"));
      setChecked({});
      setExtraIds(null);
      setBulkTenantId("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setBusy(false);
    }
  }

  const pendingTotal = Object.values(typeCounts).reduce((a, b) => a + b, 0);
  const tenantNameById = new Map(tenants.map((t) => [t.id, t.companyName]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">コンシェル同期</h1>
        <p className="text-sm text-gray-500 mt-1">
          SB法人コンシェル側の回線情報と台帳の差分です。承認するまで台帳は変わりません。
        </p>
      </div>

      {/* 最終観測がいつ時点なのかを常に見せる。請求ファイルだけの状態を「現在」と誤認しないため */}
      <Card>
        <CardContent className="py-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-gray-500">観測済みの回線</span>{" "}
            <span className="font-semibold">{mirror.count.toLocaleString()}件</span>
          </div>
          <div>
            <span className="text-gray-500">最終観測</span>{" "}
            <span className="font-semibold">
              {mirror.observedAt ? formatJstDateTime(mirror.observedAt) : "—"}
            </span>
            {mirror.source === "billing_csv" && (
              <span className="ml-2 text-amber-700">
                （請求ファイル＝その月の断面。以降の開通・機種変更・解約は未反映）
              </span>
            )}
          </div>
          {lastRun && (
            <div>
              <span className="text-gray-500">最終実行</span>{" "}
              <span className="font-semibold">
                {RUN_TYPE_LABELS[lastRun.runType] ?? lastRun.runType} /{" "}
                {RUN_STATUS_LABELS[lastRun.status] ?? lastRun.status}
              </span>
              <span className="ml-2 text-gray-500">
                {formatJstDateTime(lastRun.finishedAt ?? lastRun.queuedAt)}
              </span>
              {lastRun.errorMessage && (
                <span className="ml-2 text-red-600">{lastRun.errorMessage}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 種別ごとの未承認件数 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => navigate({ type: "", q: "", company: "", page: 1 })}
          className={`px-3 py-1.5 rounded-md border text-sm ${
            !filters.type ? "bg-gray-900 text-white border-gray-900" : "bg-white hover:bg-gray-50"
          }`}
        >
          すべて {pendingTotal.toLocaleString()}
        </button>
        {TYPE_ORDER.filter((t) => typeCounts[t]).map((t) => (
          <button
            key={t}
            onClick={() => navigate({ type: t, company: "", page: 1 })}
            title={DIFF_TYPE_HINTS[t]}
            className={`px-3 py-1.5 rounded-md border text-sm ${
              filters.type === t
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white hover:bg-gray-50"
            }`}
          >
            {DIFF_TYPE_LABELS[t] ?? t} {typeCounts[t].toLocaleString()}
          </button>
        ))}
      </div>

      {filters.type && DIFF_TYPE_HINTS[filters.type] && (
        <div className="text-sm text-gray-600 bg-gray-50 border rounded-md p-3">
          {DIFF_TYPE_HINTS[filters.type]}
        </div>
      )}

      {/* 新規開通はSBの氏名欄（＝提供先の会社名）ごとにまとめて割り当てる */}
      {filters.type === "line_added" && companyCounts.length > 0 && (
        <Card>
          <CardContent className="py-3 space-y-2">
            <div className="text-sm font-medium">
              SBの氏名欄ごとの件数（クリックで絞り込み）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {companyCounts.map((c) => {
                const known = tenants.some((t) => t.companyName.trim() === c.name.trim());
                return (
                  <button
                    key={c.name}
                    onClick={() =>
                      navigate({
                        company: filters.company === c.name ? "" : c.name,
                        page: 1,
                      })
                    }
                    className={`px-2 py-1 rounded border text-xs ${
                      filters.company === c.name
                        ? "bg-gray-900 text-white border-gray-900"
                        : known
                          ? "bg-green-50 border-green-300 hover:bg-green-100"
                          : "bg-white hover:bg-gray-50"
                    }`}
                    title={known ? "取引先に登録済み" : "取引先マスタに未登録"}
                  >
                    {c.name} {c.n}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500">
              緑＝取引先マスタに登録済み。未登録の会社は、先に取引先を作るか、この画面で割当先を選んでください。
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.status}
          onChange={(e) => navigate({ status: e.target.value, page: 1 })}
          className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          {["pending", "approved", "applied", "rejected", "failed", "superseded"].map((s) => (
            <option key={s} value={s}>
              {DIFF_STATUS_LABELS[s]}（{statusCounts[s] ?? 0}）
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ q, company: "", page: 1 });
          }}
          className="flex gap-2"
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="電話番号・会社名で検索"
            className="h-8 w-64"
          />
          <Button type="submit" variant="outline" size="sm">
            検索
          </Button>
        </form>
        <div className="ml-auto text-sm text-gray-500">
          {total.toLocaleString()}件中 {total === 0 ? 0 : (page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, total)}件
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}
      {result && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800 flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {result}
        </div>
      )}

      {targetCount > 0 && filters.status === "pending" && (
        <Card className="sticky top-2 z-10 shadow">
          <CardContent className="py-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">
              {targetCount.toLocaleString()}件を選択中
              {extraIds && <span className="text-gray-500">（検索結果すべて）</span>}
            </span>
            {hasLineAdded && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">割当先</span>
                <div className="w-64">
                  <TenantCombobox
                    tenants={tenants}
                    name="bulkTenantId"
                    defaultTenant={
                      tenants.find((t) => t.id === effectiveTenantId) ?? null
                    }
                    onChange={(t) => setBulkTenantId(t?.id ?? "")}
                  />
                </div>
              </div>
            )}
            {needsTenant && (
              <span className="text-sm text-amber-700 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                新規開通を承認するには割当先を選んでください
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirm("reject")}
              >
                却下
              </Button>
              <Button size="sm" disabled={busy || needsTenant} onClick={() => setConfirm("approve")}>
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                承認して反映
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="p-2 w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => {
                      const next = !allChecked;
                      const copy: Record<string, boolean> = {};
                      for (const r of rows) copy[r.id] = next;
                      setChecked(copy);
                      setExtraIds(null);
                    }}
                  />
                </th>
                <th className="p-2 text-left">種別</th>
                <th className="p-2 text-left">電話番号</th>
                <th className="p-2 text-left">SBの氏名欄</th>
                <th className="p-2 text-left">現在値</th>
                <th className="p-2 text-left">提案値</th>
                <th className="p-2 text-left">台帳の提供先</th>
                <th className="p-2 text-left">検出</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    該当する差分はありません
                  </td>
                </tr>
              )}
              {rows.length > 0 && allChecked && !extraIds && total > rows.length && (
                <tr className="bg-blue-50 border-b">
                  <td colSpan={8} className="p-2 text-center text-sm">
                    このページの{rows.length}件を選択中。
                    <button
                      onClick={selectAllMatching}
                      disabled={busy}
                      className="ml-2 text-blue-700 underline"
                    >
                      検索結果 {total.toLocaleString()}件すべてを選択する
                    </button>
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={!!checked[r.id]}
                      onChange={() => {
                        setExtraIds(null);
                        setChecked((p) => ({ ...p, [r.id]: !p[r.id] }));
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <Badge variant={r.direction === "outbound" ? "default" : "secondary"}>
                      {DIFF_TYPE_LABELS[r.diffType] ?? r.diffType}
                    </Badge>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {DIRECTION_LABELS[r.direction]}
                    </div>
                  </td>
                  <td className="p-2 font-mono whitespace-nowrap">{r.phoneNumber}</td>
                  <td className="p-2">
                    {r.baseConciergeValue ?? "—"}
                    {r.diffType === "line_added" && r.suggestedTenantId && (
                      <div className="text-[10px] text-green-700">取引先に一致</div>
                    )}
                  </td>
                  <td className="p-2 font-mono text-gray-500 break-all">
                    {r.beforeValue ?? "—"}
                  </td>
                  <td className="p-2 font-mono break-all">{r.afterValue ?? "—"}</td>
                  <td className="p-2 text-gray-500">
                    {r.tenantId ? tenantNameById.get(r.tenantId) ?? "—" : "—"}
                  </td>
                  <td className="p-2 text-xs text-gray-500 whitespace-nowrap">
                    {formatJstDateTime(r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => navigate({ page: page - 1 })}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => navigate({ page: page + 1 })}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog open={confirm !== null} onOpenChange={() => setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "approve" ? "差分を承認します" : "差分を却下します"}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2">
            <p>
              {targetCount.toLocaleString()}件を
              {confirm === "approve" ? "承認" : "却下"}します。
            </p>
            {confirm === "approve" && (
              <ul className="list-disc pl-5 text-gray-600 space-y-1">
                <li>SB → 台帳 の差分は、承認すると台帳がその場で書き換わります</li>
                <li>
                  台帳 → SB の差分（氏名欄）は承認までです。コンシェルへの書き込みはまだ行いません
                </li>
                {hasLineAdded && effectiveTenantId && (
                  <li>
                    新規開通は「
                    {tenantNameById.get(effectiveTenantId)}」の回線として台帳に登録されます
                  </li>
                )}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              やめる
            </Button>
            <Button onClick={() => confirm && submit(confirm)} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              実行する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
