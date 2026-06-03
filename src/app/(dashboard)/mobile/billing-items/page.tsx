"use client";
import { useState, useEffect, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, RefreshCw, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type BillingItem = {
  id: string;
  itemName: string;
  isBillable: boolean;
  continuousImport: boolean;
};

const EMPTY_FORM = { itemName: "", isBillable: true, continuousImport: true };

export default function BillingItemsPage() {
  const [items, setItems] = useState<BillingItem[]>([]);
  const [tab, setTab] = useState<"billable" | "nonBillable">("billable");
  const [deleteTarget, setDeleteTarget] = useState<BillingItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function load() {
    const res = await fetch("/api/mobile/billing-items");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data);
  }

  useEffect(() => { load(); }, []);

  async function toggleField(item: BillingItem, field: "isBillable" | "continuousImport") {
    const updated = { ...item, [field]: !item[field] };
    await fetch("/api/mobile/billing-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, isBillable: updated.isBillable, continuousImport: updated.continuousImport }),
    });
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      await fetch("/api/mobile/billing-items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    });
  }

  function handleAdd() {
    setAddError(null);
    if (!form.itemName.trim()) {
      setAddError("項目名を入力してください");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/mobile/billing-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName: form.itemName.trim(), isBillable: form.isBillable, continuousImport: form.continuousImport }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "追加に失敗しました");
        return;
      }
      setItems((prev) => [...prev, data].sort((a, b) => a.columnIndex - b.columnIndex));
      setForm(EMPTY_FORM);
      setAddOpen(false);
    });
  }

  const displayed = items.filter((i) =>
    tab === "billable" ? i.isBillable : !i.isBillable
  );

  return (
    <div className="space-y-6">
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>課金項目を削除しますか？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            <span className="font-semibold">{deleteTarget?.itemName}</span> をマスタから削除します。次回のインポート時に再度検出され、分類が求められます。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isPending}>キャンセル</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "削除中..." : "削除する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 追加ダイアログ */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setForm(EMPTY_FORM); setAddError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>課金項目を追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="itemName">項目名 *</Label>
              <Input
                id="itemName"
                placeholder="例: 通話料　新サービス"
                value={form.itemName}
                onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))}
              />
            </div>
            <div className="flex gap-4">
              <div className="space-y-1">
                <Label>課金区分</Label>
                <div className="flex gap-2">
                  {[{ label: "課金", val: true }, { label: "非課金", val: false }].map(({ label, val }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, isBillable: val }))}
                      className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${form.isBillable === val ? "bg-primary text-primary-foreground border-primary" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>取込設定</Label>
                <div className="flex gap-2">
                  {[{ label: "継続取込", val: true }, { label: "今回のみ", val: false }].map(({ label, val }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, continuousImport: val }))}
                      className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${form.continuousImport === val ? "bg-primary text-primary-foreground border-primary" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {addError && <p className="text-sm text-red-600">{addError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={isPending}>キャンセル</Button>
            <Button onClick={handleAdd} disabled={isPending}>
              {isPending ? "追加中..." : "追加する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">課金項目マスタ</h1>
          <p className="text-sm text-gray-500 mt-1">SoftBank CSV取込時の課金/非課金判定設定</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            更新
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            新規追加
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        {(["billable", "nonBillable"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t === "billable" ? `課金項目 (${items.filter((i) => i.isBillable).length})` : `非課金項目 (${items.filter((i) => !i.isBillable).length})`}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">項目名</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">課金</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">継続取込</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400">項目がありません</td>
                </tr>
              )}
              {displayed.map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{item.itemName}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleField(item, "isBillable")}>
                      <Badge variant={item.isBillable ? "default" : "secondary"}>
                        {item.isBillable ? "課金" : "非課金"}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleField(item, "continuousImport")}>
                      <Badge variant={item.continuousImport ? "default" : "outline"}>
                        {item.continuousImport ? "継続取込" : "今回のみ"}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
