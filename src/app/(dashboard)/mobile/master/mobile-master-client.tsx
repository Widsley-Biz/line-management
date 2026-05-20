"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Smartphone, Upload, FileText, PackageCheck, PackageX } from "lucide-react";

type MobileLine = {
  id: string;
  phoneNumber: string;
  status: "契約中" | "解約済";
  contractStart: string | null;
  contractEnd: string | null;
  deviceReturned: number;
  notes: string | null;
  tenantId: string;
  companyName: string;
};

type Tenant = {
  id: string;
  companyName: string;
};

type Props = {
  lines: MobileLine[];
  tenants: Tenant[];
};

type ImportResult = {
  inserted: number;
  skipped: number;
  unmatchedTenants: string[];
  duplicatePhones: string[];
  errors: string[];
};

function DeviceReturnedBadge({ value }: { value: number }) {
  if (value === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <PackageCheck className="h-3 w-3" />回収済
      </span>
    );
  }
  if (value === 2) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <PackageCheck className="h-3 w-3" />回収不要
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <PackageX className="h-3 w-3" />未回収
    </span>
  );
}

export function MobileMasterClient({ lines, tenants }: Props) {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState<MobileLine | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const filtered = lines.filter(
    (l) => l.phoneNumber.includes(search) || l.companyName.includes(search)
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    const form = e.currentTarget;
    const data = {
      phoneNumber: (form.elements.namedItem("phoneNumber") as HTMLInputElement).value,
      tenantId: (form.elements.namedItem("tenantId") as HTMLSelectElement).value,
      status: (form.elements.namedItem("status") as HTMLSelectElement).value,
      contractStart: (form.elements.namedItem("contractStart") as HTMLInputElement).value || null,
      contractEnd: (form.elements.namedItem("contractEnd") as HTMLInputElement).value || null,
      deviceReturned: parseInt((form.elements.namedItem("deviceReturned") as HTMLSelectElement).value),
      notes: (form.elements.namedItem("notes") as HTMLInputElement).value || null,
      id: editTarget?.id,
    };

    await fetch("/api/mobile/master", {
      method: editTarget ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setIsSubmitting(false);
    setShowForm(false);
    setEditTarget(null);
    window.location.reload();
  }

  async function handleDelete(id: string) {
    if (!confirm("この回線を削除しますか？")) return;
    await fetch("/api/mobile/master", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    window.location.reload();
  }

  async function handleCsvImport() {
    if (!csvFile) return;
    setIsImporting(true);
    setImportResult(null);
    setImportError(null);

    const formData = new FormData();
    formData.append("file", csvFile);

    const res = await fetch("/api/mobile/master/import", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      setImportError(data.error ?? "インポートに失敗しました");
    } else {
      setImportResult(data);
      if (data.inserted > 0) setTimeout(() => window.location.reload(), 1500);
    }
    setIsImporting(false);
  }

  function downloadTemplate() {
    const bom = "\uFEFF";
    const header = "電話番号,会社名,ステータス,契約開始日,解約日,備考";
    const example = "090-1234-5678,株式会社サンプル,契約中,2024-01-01,,";
    const blob = new Blob([bom + header + "\n" + example], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "回線マスタ_インポートテンプレート.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">回線マスタ管理</h1>
          <p className="text-sm text-gray-500 mt-1">電話番号とテナントの紐付けを管理します</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setShowImport(!showImport); setShowForm(false); }}>
            <Upload className="h-4 w-4 mr-2" />CSV一括登録
          </Button>
          <Button onClick={() => { setEditTarget(null); setShowForm(true); setShowImport(false); }}>
            <Plus className="h-4 w-4 mr-2" />新規登録
          </Button>
        </div>
      </div>

      {/* CSVインポートフォーム */}
      {showImport && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-blue-600" />CSV一括インポート
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-800 space-y-1">
              <p className="font-medium">CSVフォーマット（1行目はヘッダー）</p>
              <p className="font-mono">電話番号,会社名,ステータス,契約開始日,解約日,備考</p>
              <p className="text-gray-500">※ステータスは「契約中」または「解約済」（省略時は「契約中」）</p>
              <p className="text-gray-500">※日付はYYYY-MM-DD形式（省略可）</p>
              <p className="text-gray-500">※電話番号はハイフンあり・なし両対応</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileText className="h-4 w-4 mr-2" />テンプレートをダウンロード
            </Button>
            <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-blue-200 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
              <Upload className="h-5 w-5 text-blue-400 mb-1" />
              <span className="text-sm text-gray-500">
                {csvFile ? csvFile.name : "クリックしてファイルを選択（.csv）"}
              </span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { setCsvFile(e.target.files?.[0] ?? null); setImportResult(null); setImportError(null); }}
              />
            </label>
            {importError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{importError}</div>
            )}
            {importResult && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm space-y-2">
                <p className="font-medium text-green-800">
                  インポート完了：{importResult.inserted}件登録、{importResult.skipped}件スキップ
                </p>
                {importResult.unmatchedTenants.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-amber-700">未照合の会社名（{importResult.unmatchedTenants.length}件）</p>
                    <div className="max-h-24 overflow-y-auto bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                      {importResult.unmatchedTenants.map((t, i) => <p key={i} className="text-xs text-amber-800 font-mono">{t}</p>)}
                    </div>
                  </div>
                )}
                {importResult.duplicatePhones.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-600">重複スキップ（{importResult.duplicatePhones.length}件）</p>
                    <div className="max-h-24 overflow-y-auto bg-gray-50 border border-gray-200 rounded p-2 mt-1">
                      {importResult.duplicatePhones.map((p, i) => <p key={i} className="text-xs text-gray-600 font-mono">{p}</p>)}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCsvImport} disabled={!csvFile || isImporting}>
                {isImporting ? "インポート中..." : "インポート実行"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowImport(false); setCsvFile(null); setImportResult(null); setImportError(null); }}>
                閉じる
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 登録・編集フォーム */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editTarget ? "回線情報を編集" : "新規回線登録"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">携帯番号 *</Label>
                <Input
                  name="phoneNumber"
                  placeholder="例: 090-1234-5678"
                  defaultValue={editTarget?.phoneNumber}
                  required
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">会社名 *</Label>
                <select
                  name="tenantId"
                  required
                  defaultValue={editTarget?.tenantId}
                  className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">選択してください</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.companyName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ステータス</Label>
                <select
                  name="status"
                  defaultValue={editTarget?.status ?? "契約中"}
                  className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="契約中">契約中</option>
                  <option value="解約済">解約済</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">契約開始日</Label>
                <Input name="contractStart" type="date" defaultValue={editTarget?.contractStart ?? ""} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">解約日</Label>
                <Input name="contractEnd" type="date" defaultValue={editTarget?.contractEnd ?? ""} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">端末回収</Label>
                <select
                  name="deviceReturned"
                  defaultValue={editTarget?.deviceReturned ?? 0}
                  className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value={0}>未回収</option>
                  <option value={1}>回収済</option>
                  <option value={2}>回収不要</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">備考</Label>
                <Input name="notes" placeholder="任意" defaultValue={editTarget?.notes ?? ""} className="h-8 text-sm" />
              </div>
              <div className="col-span-2 md:col-span-3 flex gap-2">
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? "保存中..." : editTarget ? "更新する" : "登録する"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setEditTarget(null); }}>
                  キャンセル
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* 一覧テーブル */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Input
            placeholder="電話番号・会社名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm h-8 text-sm"
          />
          <div className="text-xs text-gray-500">{filtered.length} 件</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500">
                  <th className="text-left py-2 pr-4">携帯番号</th>
                  <th className="text-left py-2 pr-4">会社名</th>
                  <th className="text-left py-2 pr-4">ステータス</th>
                  <th className="text-left py-2 pr-4">契約開始日</th>
                  <th className="text-left py-2 pr-4">解約日</th>
                  <th className="text-left py-2 pr-4">端末回収</th>
                  <th className="text-left py-2 pr-4">備考</th>
                  <th className="text-left py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-400">
                      <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      データがありません
                    </td>
                  </tr>
                ) : (
                  filtered.map((line) => (
                    <tr key={line.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 pr-4 font-mono">{line.phoneNumber}</td>
                      <td className="py-2 pr-4">{line.companyName}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          line.status === "契約中" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {line.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-500">{line.contractStart ?? "-"}</td>
                      <td className="py-2 pr-4 text-gray-500">{line.contractEnd ?? "-"}</td>
                      <td className="py-2 pr-4">
                        <DeviceReturnedBadge value={line.deviceReturned} />
                      </td>
                      <td className="py-2 pr-4 text-gray-500">{line.notes ?? "-"}</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => { setEditTarget(line); setShowForm(true); setShowImport(false); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                            onClick={() => handleDelete(line.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}