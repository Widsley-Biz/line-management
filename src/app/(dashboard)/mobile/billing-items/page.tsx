"use client";
import { useState, useEffect, useTransition, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, RefreshCw, Plus, Upload } from "lucide-react";
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

type CsvNewItem = {
  itemName: string;
  isBillable: boolean;
  continuousImport: boolean;
  skip: boolean;
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
  const [csvNewItems, setCsvNewItems] = useState<CsvNewItem[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

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

  function handleCsvSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      // ヘッダー行（1行目）のみ読み込み、列名を項目名として扱う
      const firstLine = (text.split(/\r?\n/)[0] ?? "").trim();
      const headers = firstLine.split(",").map((h) => h.trim()).filter(Boolean);
      // 課金・非課金問わず既にマスタにある項目はスキップ
      const existingNames = new Set(items.map((i) => i.itemName));
      const newItemNames = [...new Set(headers)].filter((name) => !existingNames.has(name));
      if (newItemNames.length === 0) {
        alert("CSVのヘッダー項目はすべてマスタに登録済みです");
      } else {
        setCsvNewItems(newItemNames.map((name) => ({ itemName: name, isBillable: true, continuousImport: true, skip: false })));
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  async function handleCsvImport() {
    setCsvImporting(true);
    try {
      for (const item of csvNewItems.filter((c) => !c.skip)) {
        const res = await fetch("/api/mobile/billing-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (res.ok) {
          const data = await res.json();
          setItems((prev) => [...prev, data].sort((a, b) => a.itemName.localeCompare(b.itemName, "ja")));
        }
      }
    } finally {
      setCsvImporting(false);
      setCsvNewItems([]);
    }
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
      setItems((prev) => [...prev, data].sort((a, b) => a.itemName.localeCompare(b.itemName, "ja")));
      setForm(EMPTY_FORM);
      setAddOpen(false);
    });
  }

  const displayed = items.filter((i) =>
    tab === "billable" ? i.isBillable : !i.isBillable
  );

  return (
    <div className="space-y-6">
      {/* CSV新規項目 分類ダイアログ */}
      <Dialog open={csvNewItems.length > 0} onOpenChange={(o) => { if (!o) setCsvNewItems([]); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新規課金項目が検出されました</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mb-3">
            CSVに既存マスタにない項目が含まれています。各項目の扱いを選択してください。
          </p>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {csvNewItems.map((item, idx) => (
              <div key={item.itemName} className={`p-3 border rounded-lg space-y-2 ${item.skip ? "opacity-50" : ""}`}>
                <p className="text-sm font-medium">{item.itemName}</p>
                <div className="flex gap-4 flex-wrap">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCsvNewItems((prev) => prev.map((c, i) => i === idx ? { ...c, isBillable: true, skip: false } : c))}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${!item.skip && item.isBillable ? "bg-primary text-primary-foreground border-primary" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                    >
                      課金
                    </button>
                    <button
                      type="button"
                      onClick={() => setCsvNewItems((prev) => prev.map((c, i) => i === idx ? { ...c, isBillable: false, skip: false } : c))}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${!item.skip && !item.isBillable ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                    >
                      非課金
                    </button>
                    <button
                      type="button"
                      onClick={() => setCsvNewItems((prev) => prev.map((c, i) => i === idx ? { ...c, skip: true } : c))}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${item.skip ? "bg-red-100 text-red-700 border-red-300" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                    >
                      取り込まない
                    </button>
                  </div>
                  {!item.skip && (
                    <div className="flex gap-2">
                      {[{ label: "継続取込", val: true }, { label: "今回のみ", val: false }].map(({ label, val }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setCsvNewItems((prev) => prev.map((c, i) => i === idx ? { ...c, continuousImport: val } : c))}
                          className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${item.continuousImport === val ? (val ? "bg-blue-600 text-white border-blue-600" : "bg-amber-500 text-white border-amber-500") : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvNewItems([])} disabled={csvImporting}>キャンセル</Button>
            <Button onClick={handleCsvImport} disabled={csvImporting}>
              {csvImporting ? "取込中..." : `確認して取込 (${csvNewItems.filter((c) => !c.skip).length}件)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />
            CSVから取込
          </Button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={handleCsvSelect}
          />
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
