"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TenantCombobox } from "@/components/tenant-combobox";
import { readJson } from "@/lib/fetch-json";
import { formatJapanesePhoneNumber, formatSeconds, formatYearMonth } from "@/lib/format";
import type { UnmatchedNumberWithRows } from "@/lib/cdr-unmatched-rows";

type Tenant = { id: string; companyName: string };

/**
 * CDR取込結果カードの未紐付け番号を取引先に割り当てるモーダル。
 * 割当は /ip/unmatched と同じ PATCH /api/ip/unmatched（番号マスタ自動登録＋金額再計算）を
 * 未照合レコード（番号×利用月）ごとに呼ぶ。
 */
export function CdrUnmatchedAssignDialog({
  target,
  tenants,
  onClose,
  onAssigned,
}: {
  target: UnmatchedNumberWithRows | null;
  tenants: Tenant[];
  onClose: () => void;
  /** 割当が済んだ未照合レコードのID（一部失敗しても成功分は渡す） */
  onAssigned: (ids: string[]) => void;
}) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = target?.rows ?? [];

  function close() {
    if (submitting) return;
    setTenant(null);
    setError(null);
    onClose();
  }

  async function handleAssign() {
    if (!tenant || rows.length === 0) return;
    setSubmitting(true);
    setError(null);
    const done: string[] = [];
    const failures: string[] = [];
    try {
      // 利用月ごとに別レコードなので1件ずつ割り当てる（各リクエストはサーバー側でトランザクション）
      for (const row of rows) {
        try {
          const res = await fetch("/api/ip/unmatched", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: row.id, action: "assign", tenantId: tenant.id }),
          });
          const result = await readJson<{ ok: boolean }>(res);
          if (result.ok) done.push(row.id);
          else failures.push(`${formatYearMonth(row.yearMonth)}: ${result.error}`);
        } catch (e) {
          failures.push(
            `${formatYearMonth(row.yearMonth)}: ${e instanceof Error ? e.message : "通信に失敗しました"}`
          );
        }
      }
    } finally {
      setSubmitting(false);
    }

    if (done.length > 0) onAssigned(done);
    if (failures.length > 0) {
      setError(`割当できなかった利用月があります\n${failures.join("\n")}`);
      return;
    }
    setTenant(null);
    onClose();
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>未紐付け番号を取引先に割り当て</DialogTitle>
          <DialogDescription>
            割り当てると番号マスタに表番号として登録され、該当月の通話料に反映されます。
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500">ご利用番号（CDR）</p>
              <p className="font-mono font-medium text-gray-800">
                {formatJapanesePhoneNumber(target.phoneNumber)}
              </p>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-amber-700">
                この番号の未照合データが見つかりません。
                <Link href="/ip/unmatched" className="underline">未照合一覧（IP回線）</Link>
                から割り当ててください。
              </p>
            ) : (
              <>
                <div>
                  <p className="text-xs text-gray-500 mb-1">割当対象（{rows.length}件）</p>
                  <div className="rounded border divide-y text-sm">
                    {rows.map((row) => (
                      <div key={row.id} className="flex justify-between px-3 py-1.5">
                        <span className="text-gray-600">{formatYearMonth(row.yearMonth)}</span>
                        <span className="text-gray-700">{formatSeconds(row.totalSeconds)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">取引先</p>
                  <TenantCombobox
                    tenants={tenants}
                    placeholder="取引先を検索..."
                    onChange={(t) => setTenant(t)}
                  />
                </div>
              </>
            )}

            {error && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 whitespace-pre-wrap">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={submitting}>
            閉じる
          </Button>
          <Button onClick={handleAssign} disabled={!tenant || rows.length === 0 || submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            割り当てる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
