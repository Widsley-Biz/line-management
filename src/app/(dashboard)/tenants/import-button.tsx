"use client";

import { useState, useRef } from "react";
import { Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ImportResult = {
  inserted: number;
  skipped: number;
  duplicates: string[];
  errors: string[];
};

export function TenantImportButton() {
  const [showPanel, setShowPanel] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const bom = "\uFEFF";
    const header = "会社名,SF商談ID,MFパートナーID,備考";
    const example = "株式会社サンプル,006Q900001aE5U2IAK,,";
    const blob = new Blob([bom + header + "\n" + example], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "テナント_インポートテンプレート.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!csvFile) return;
    setIsImporting(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", csvFile);

    const res = await fetch("/api/tenants/import", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "インポートに失敗しました");
    } else {
      setResult(data);
      if (data.inserted > 0) {
        setTimeout(() => window.location.reload(), 1500);
      }
    }
    setIsImporting(false);
  }

  function handleClose() {
    setShowPanel(false);
    setCsvFile(null);
    setResult(null);
    setError(null);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setShowPanel(!showPanel)}>
        <Upload className="h-4 w-4 mr-2" />
        CSV一括登録
      </Button>

      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                テナントCSV一括登録
              </CardTitle>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* フォーマット説明 */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-800 space-y-1">
                <p className="font-medium">CSVフォーマット（1行目はヘッダー）</p>
                <p className="font-mono">会社名,SF商談ID,MFパートナーID,備考</p>
                <p className="text-gray-500">※ 会社名・SF商談ID は必須</p>
                <p className="text-gray-500">※ slugはSF商談IDが自動設定されます</p>
                <p className="text-gray-500">※ SF商談IDが重複する行はスキップされます</p>
              </div>

              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <FileText className="h-4 w-4 mr-2" />
                テンプレートをダウンロード
              </Button>

              {/* ファイル選択 */}
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
                <Upload className="h-5 w-5 text-gray-400 mb-1" />
                <span className="text-sm text-gray-500">
                  {csvFile ? csvFile.name : "クリックしてCSVファイルを選択"}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    setCsvFile(e.target.files?.[0] ?? null);
                    setResult(null);
                    setError(null);
                  }}
                />
              </label>

              {/* エラー */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* 結果 */}
              {result && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm space-y-2">
                  <p className="font-medium text-green-800">
                    完了：{result.inserted}件登録、{result.skipped}件スキップ
                  </p>
                  {result.duplicates.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-amber-700">
                        重複スキップ（{result.duplicates.length}件）
                      </p>
                      <div className="max-h-24 overflow-y-auto bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                        {result.duplicates.map((d, i) => (
                          <p key={i} className="text-xs text-amber-800 font-mono">{d}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.errors.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-700">
                        エラー（{result.errors.length}件）
                      </p>
                      <div className="max-h-24 overflow-y-auto bg-red-50 border border-red-200 rounded p-2 mt-1">
                        {result.errors.map((e, i) => (
                          <p key={i} className="text-xs text-red-800">{e}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleImport}
                  disabled={!csvFile || isImporting}
                  size="sm"
                >
                  {isImporting ? "インポート中..." : "インポート実行"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleClose}>
                  閉じる
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}