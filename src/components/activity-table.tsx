"use client";
import { useState, useMemo } from "react";
import { Search, X, ChevronRight } from "lucide-react";
import { SortableHeader } from "@/components/sortable-header";

type ActivityRow = {
  id: string;
  actionType: string;
  message: string | null;
  targetTable: string | null;
  createdAt: string;
  userName: string | null;
  beforeJson?: string | null;
  afterJson?: string | null;
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  tenant_create: "テナント登録",
  tenant_update: "テナント更新",
  user_create: "ユーザー追加",
  user_update: "ユーザー更新",
  user_delete: "ユーザー削除",
  pack_create: "パック追加",
  pack_update: "パック更新",
  pack_disable: "パック無効化",
  sf_send: "SF送信",
  import: "インポート",
  action_create: "アクション登録",
  action_update: "アクション更新",
  circuit_create: "回線登録",
  circuit_update: "回線更新",
  billing_account_create: "請求アカウント登録",
  billing_account_update: "請求アカウント更新",
};

function actionTypeLabel(type: string) {
  return ACTION_TYPE_LABELS[type] ?? type;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  return `${Math.floor(hr / 24)}日前`;
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

function JsonView({ json }: { json: string | null | undefined }) {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return (
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">詳細</p>
        <p className="text-sm text-gray-800 bg-gray-50 border rounded p-3">{json}</p>
      </div>
    );
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const success = obj.success as number | undefined;
    const unmatched = obj.unmatched as string[] | undefined;
    const errors = obj.errors as string[] | undefined;
    const hasUnmatched = unmatched && unmatched.length > 0;
    const hasErrors = errors && errors.length > 0;

    return (
      <div className="space-y-3">
        {success !== undefined && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              成功 {success}件
            </span>
            {hasUnmatched && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                未照合 {unmatched.length}件
              </span>
            )}
            {hasErrors && (
              <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                エラー {errors.length}件
              </span>
            )}
          </div>
        )}
        {hasUnmatched && (
          <div>
            <p className="text-xs font-medium text-amber-700 mb-1">
              未照合（{unmatched.length}件）— マスタ管理で登録してください
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded p-2 max-h-32 overflow-y-auto">
              {unmatched.map((u, i) => (
                <p key={i} className="text-xs text-amber-800 font-mono">{formatPhone(u)}</p>
              ))}
            </div>
          </div>
        )}
        {hasErrors && (
          <div>
            <p className="text-xs font-medium text-red-700 mb-1">
              エラー（{errors.length}件）
            </p>
            <div className="bg-red-50 border border-red-200 rounded p-2 max-h-32 overflow-y-auto">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-red-800">{e}</p>
              ))}
            </div>
          </div>
        )}
        {success !== undefined && !hasUnmatched && !hasErrors && (
          <p className="text-xs text-gray-400">問題なく完了しました</p>
        )}
      </div>
    );
  }

  return null;
}

function DetailModal({ row, onClose }: { row: ActivityRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {actionTypeLabel(row.actionType)}
            </span>
            <span className="text-sm font-medium text-gray-800">操作詳細</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">実行者</p>
              <p className="font-medium">{row.userName ?? "システム"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">日時</p>
              <p className="font-medium">{row.createdAt.replace("T", " ").slice(0, 16)}</p>
            </div>
            {row.targetTable && (
              <div>
                <p className="text-xs text-gray-400">対象テーブル</p>
                <p className="font-mono text-xs">{row.targetTable}</p>
              </div>
            )}
          </div>

          {row.message && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">内容</p>
              <p className="text-sm text-gray-800 bg-gray-50 border rounded p-3">
                {row.message}
              </p>
            </div>
          )}

          <JsonView json={row.afterJson} />

          {!row.afterJson && !row.message && (
            <p className="text-sm text-gray-400 text-center py-4">詳細データがありません</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActivityTable({ rows }: { rows: ActivityRow[] }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedRow, setSelectedRow] = useState<ActivityRow | null>(null);

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let arr = rows.filter((r) =>
      !q ||
      actionTypeLabel(r.actionType).includes(q) ||
      (r.message ?? "").toLowerCase().includes(q) ||
      (r.userName ?? "").toLowerCase().includes(q)
    );
    arr = [...arr].sort((a, b) => {
      let av: string, bv: string;
      if (sortCol === "actionType") {
        av = actionTypeLabel(a.actionType);
        bv = actionTypeLabel(b.actionType);
      } else if (sortCol === "userName") {
        av = a.userName ?? "";
        bv = b.userName ?? "";
      } else if (sortCol === "message") {
        av = a.message ?? "";
        bv = b.message ?? "";
      } else {
        av = a.createdAt;
        bv = b.createdAt;
      }
      av = av.toLowerCase();
      bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, search, sortCol, sortDir]);

  const thCls = "text-left px-4 py-3 font-medium text-gray-600 text-sm";

  return (
    <>
      {selectedRow && (
        <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}

      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="種別・内容・実行者で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <SortableHeader label="種別" column="actionType" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="内容" column="message" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="実行者" column="userName" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="日時" column="createdAt" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400 text-sm">
                  {search ? "検索結果がありません" : "履歴がありません"}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr
                key={r.id}
                className="border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedRow(r)}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {actionTypeLabel(r.actionType)}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-800 max-w-md truncate">
                  {r.message ?? `${actionTypeLabel(r.actionType)}が実行されました`}
                </td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {r.userName ?? "システム"}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  <span title={r.createdAt.replace("T", " ").slice(0, 16)}>
                    {relativeTime(r.createdAt)}
                  </span>
                  <span className="ml-2 opacity-70">{r.createdAt.replace("T", " ").slice(0, 16)}</span>
                </td>
                <td className="px-4 py-3 text-gray-300">
                  <ChevronRight className="h-4 w-4" />
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