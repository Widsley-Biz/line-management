"use client";
import { Fragment, useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SortableHeader } from "@/components/sortable-header";
import { TenantCombobox } from "@/components/tenant-combobox";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Search, ClipboardList } from "lucide-react";

const ACTION_TYPES = ["SF送信待ち", "請求差分確認", "ユニットch対応", "その他"] as const;

type ActionRow = {
  id: string;
  type: string;
  description: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  tenantId: string | null;
  assigneeId: string | null;
  companyName: string | null;
  assigneeName: string | null;
};

type TenantOption = { id: string; companyName: string };
type UserOption = { id: string; name: string };

interface ActionsTableProps {
  rows: ActionRow[];
  tenantList: TenantOption[];
  userList: UserOption[];
  editAction: string | undefined;
  updateActionStatus: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}

const STATUS_ORDER: Record<string, number> = { "未着手": 0, "対応中": 1, "完了": 2 };

export function ActionsTable({
  rows,
  tenantList,
  userList,
  editAction,
  updateActionStatus,
  updateAction,
  deleteAction,
}: ActionsTableProps) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let arr = rows.filter((r) =>
      !q ||
      r.type.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      (r.companyName ?? "").toLowerCase().includes(q) ||
      (r.assigneeName ?? "").toLowerCase().includes(q) ||
      r.status.includes(q)
    );
    arr = [...arr].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortCol === "status") {
        av = STATUS_ORDER[a.status] ?? 9;
        bv = STATUS_ORDER[b.status] ?? 9;
      } else {
        av = (a as Record<string, unknown>)[sortCol] as string ?? "";
        bv = (b as Record<string, unknown>)[sortCol] as string ?? "";
      }
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, search, sortCol, sortDir]);

  const thCls = "text-left px-4 py-3 font-medium text-gray-600";

  return (
    <>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="種別・説明・取引先・実行者・ステータスで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <SortableHeader label="種別" column="type" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="説明" column="description" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="取引先" column="companyName" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="実行者" column="assigneeName" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="期限" column="dueDate" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="ステータス" column="status" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <th className="text-left px-4 py-3 font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {search ? "該当データがありません" : "アクションデータがありません"}
                </td>
              </tr>
            )}
            {filtered.map((a) => (
              <Fragment key={a.id}>
                <tr className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Badge variant="outline">{a.type}</Badge>
                  </td>
                  <td className="px-4 py-3 max-w-48 truncate">{a.description}</td>
                  <td className="px-4 py-3">
                    {a.companyName ? (
                      <Link href={`/tenants/${a.tenantId}`} className="text-blue-600 hover:underline">
                        {a.companyName}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{a.assigneeName ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.dueDate ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        a.status === "完了" ? "default"
                        : a.status === "対応中" ? "secondary"
                        : "outline"
                      }
                    >
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <form action={updateActionStatus} className="flex gap-1">
                        <input type="hidden" name="actionId" value={a.id} />
                        {a.status !== "対応中" && (
                          <button
                            type="submit"
                            name="status"
                            value="対応中"
                            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            対応中
                          </button>
                        )}
                        {a.status !== "完了" && (
                          <button
                            type="submit"
                            name="status"
                            value="完了"
                            className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            完了
                          </button>
                        )}
                      </form>
                      <a
                        href={`/actions?editAction=${a.id}`}
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                      >
                        編集
                      </a>
                      <form action={deleteAction}>
                        <input type="hidden" name="actionId" value={a.id} />
                        <ConfirmDeleteButton
                          message={`「${a.description}」を削除しますか？`}
                          className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700"
                        >
                          削除
                        </ConfirmDeleteButton>
                      </form>
                    </div>
                  </td>
                </tr>
                {editAction === a.id && (
                  <tr className="bg-blue-50 border-b">
                    <td colSpan={7} className="px-4 py-4">
                      <p className="text-xs font-medium text-blue-700 mb-3">アクション編集</p>
                      <form action={updateAction} className="grid grid-cols-2 gap-3">
                        <input type="hidden" name="actionId" value={a.id} />
                        <div className="space-y-1">
                          <Label className="text-xs">種別 *</Label>
                          <select
                            name="type"
                            defaultValue={a.type}
                            required
                            className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                          >
                            {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">取引先</Label>
                          <TenantCombobox
                            tenants={tenantList}
                            name="tenantId"
                            defaultTenant={tenantList.find((t) => t.id === a.tenantId) ?? null}
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">説明 *</Label>
                          <Input name="description" defaultValue={a.description} required className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">アクション実行者</Label>
                          <select
                            name="assigneeId"
                            defaultValue={a.assigneeId ?? ""}
                            className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                          >
                            <option value="">未設定</option>
                            {userList.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">期限</Label>
                          <Input name="dueDate" type="date" defaultValue={a.dueDate ?? ""} className="h-8 text-sm" />
                        </div>
                        <div className="col-span-2 flex gap-2">
                          <Button type="submit" size="sm">保存</Button>
                          <a
                            href="/actions"
                            className="inline-flex items-center h-8 px-3 rounded-md text-sm text-gray-600 hover:bg-gray-100"
                          >
                            キャンセル
                          </a>
                        </div>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
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
