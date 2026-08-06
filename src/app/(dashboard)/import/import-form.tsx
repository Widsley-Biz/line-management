"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Loader2, Smartphone, CheckCircle2, AlertTriangle, X, Network } from "lucide-react";
import { formatJapanesePhoneNumber, formatJstDateTime } from "@/lib/format";
import { readJson } from "@/lib/fetch-json";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface SoftBankImportResult {
  success: number;
  unmatched: string[];
  errors: string[];
}

interface SbPreview {
  billingItems: string[];
  unknownItems: string[];
}

type UnknownClassification = {
  itemName: string;
  isBillable: boolean;
  skip: boolean;
};

type CdrUnmatchedNumber = {
  phoneNumber: string;
  rowCount: number;
  totalSeconds: number;
};

type CdrFileResult = {
  fileName: string;
  status: "imported" | "skipped" | "error";
  message?: string;
  yearMonth?: string;
  billingAccount?: string;
  rowCount?: number;
  importedRows?: number;
  tenantCount?: number;
  unmatchedNumbers?: CdrUnmatchedNumber[];
  unknownCallTypes?: string[];
};

// Cloud Runのリクエストサイズ上限は32MiB。これを超えるファイルはアプリに届く前に
// 413で弾かれるため、大きいファイルは送信前にgzip圧縮する（CSVは実測で約1/11になる）。
// サーバー側は先頭バイトでgzipを判定して展開するので、ファイル名はそのまま送る。
const COMPRESS_THRESHOLD_BYTES = 8 * 1024 * 1024;

async function compressIfLarge(file: File): Promise<File> {
  if (
    file.size < COMPRESS_THRESHOLD_BYTES ||
    typeof CompressionStream === "undefined"
  ) {
    return file;
  }
  try {
    const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
    const blob = await new Response(stream).blob();
    return new File([blob], file.name, { type: "application/gzip" });
  } catch {
    // 圧縮に失敗した場合は元のファイルをそのまま送る
    return file;
  }
}

type ImportedFile = {
  id: string;
  fileName: string;
  billingAccount: string | null;
  yearMonth: string | null;
  rowCount: number;
  importedAt: string;
};

export function ImportForm() {
  const [yearMonth, setYearMonth] = useState("");
  const [importedFiles, setImportedFiles] = useState<ImportedFile[] | null>(null);
  const [cdrFiles, setCdrFiles] = useState<File[]>([]);
  const [isCdrDragging, setIsCdrDragging] = useState(false);
  const [softBankFile, setSoftBankFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [cdrResults, setCdrResults] = useState<CdrFileResult[] | null>(null);
  const [sbResult, setSbResult] = useState<SoftBankImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // SoftBank課金項目確認ダイアログ
  const [sbPreview, setSbPreview] = useState<SbPreview | null>(null);
  const [unknownClassifications, setUnknownClassifications] = useState<UnknownClassification[]>([]);

  // 取込済みファイル一覧（同じファイルを二重に取り込まないための確認用）
  const loadImportedFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/ip/import-files");
      const result = await readJson<ImportedFile[]>(res);
      if (result.ok) setImportedFiles(result.data);
    } catch {
      // 一覧の取得失敗は取込作業を妨げないため、画面上は無視する
    }
  }, []);

  useEffect(() => {
    loadImportedFiles();
  }, [loadImportedFiles]);

  const addCdrFiles = (files: File[]) => {
    if (files.length === 0) return;
    // 既存の選択に追加（同名は置き換え）
    setCdrFiles((prev) => {
      const names = new Set(files.map((f) => f.name));
      return [...prev.filter((f) => !names.has(f.name)), ...files];
    });
    setCdrResults(null);
  };

  const handleCdrFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addCdrFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleCdrDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsCdrDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) =>
      f.name.toLowerCase().endsWith(".csv")
    );
    addCdrFiles(files);
  };

  const removeCdrFile = (name: string) => {
    setCdrFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleSoftBankFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setSoftBankFile(file);
  };

  const handleImport = async () => {
    if (!cdrFiles.length && !softBankFile) {
      setError("ファイルを選択してください");
      return;
    }
    if (softBankFile && !yearMonth) {
      setError("SoftBankファイルの取込には利用年月の入力が必要です");
      return;
    }

    setError(null);

    // SoftBankファイルがある場合、先に課金項目プレビューを取得してダイアログ表示
    if (softBankFile) {
      setLoading(true);
      try {
        const fd = new FormData();
        fd.append("yearMonth", yearMonth);
        fd.append("softBank", await compressIfLarge(softBankFile));
        fd.append("previewOnly", "true");

        const res = await fetch("/api/billing/import", { method: "POST", body: fd });
        const result = await readJson<{ softBank?: { preview?: SbPreview } }>(res);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const data = result.data;

        const preview: SbPreview = data.softBank?.preview ?? { billingItems: [], unknownItems: [] };
        setSbPreview(preview);
        setUnknownClassifications(
          preview.unknownItems.map((name) => ({ itemName: name, isBillable: true, skip: false }))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "エラーが発生しました");
      } finally {
        setLoading(false);
      }
      return;
    }

    // CDRのみの場合はそのまま取込
    await runActualImport();
  };

  const runActualImport = async () => {
    setLoading(true);
    setError(null);
    setCdrResults(null);
    setSbResult(null);

    try {
      // CDR CSV（IP回線）
      if (cdrFiles.length > 0) {
        const fd = new FormData();
        for (const f of cdrFiles) fd.append("files", await compressIfLarge(f));
        const res = await fetch("/api/ip/import", { method: "POST", body: fd });
        const result = await readJson<{ results?: CdrFileResult[] }>(res);
        if (!result.ok) {
          setError(result.error);
        } else {
          setCdrResults(result.data.results ?? []);
          setCdrFiles([]);
        }
        await loadImportedFiles();
      }

      // SoftBank（携帯回線）
      if (softBankFile) {
        const fd = new FormData();
        fd.append("yearMonth", yearMonth);
        fd.append("softBank", await compressIfLarge(softBankFile));
        const res = await fetch("/api/billing/import", { method: "POST", body: fd });
        const result = await readJson<{ softBank?: SoftBankImportResult }>(res);
        if (!result.ok) {
          setError(result.error);
        } else {
          setSbResult(result.data.softBank ?? null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    setLoading(true);
    // 未登録項目をすべてマスタに登録（スキップはcontinuousImport:falseで登録して「既知」扱いに）
    for (const item of unknownClassifications) {
      await fetch("/api/mobile/billing-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: item.itemName,
          isBillable: item.skip ? false : item.isBillable,
          continuousImport: !item.skip,
        }),
      });
    }
    setSbPreview(null);
    runActualImport();
  };

  const hasUnknownItems = (sbPreview?.unknownItems.length ?? 0) > 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* SoftBank課金項目確認ダイアログ */}
      <Dialog open={!!sbPreview} onOpenChange={(o) => { if (!o) setSbPreview(null); }}>
        <DialogContent className="w-[92vw] max-w-[92vw] sm:max-w-[92vw] max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>SoftBank取込内容の確認</DialogTitle>
          </DialogHeader>

          <div className={`overflow-y-auto flex-1 pr-1 ${hasUnknownItems ? "grid grid-cols-2 gap-6" : ""}`}>
            {/* 左列: 課金項目一覧 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                課金項目（超過金額に加算されます）
              </p>
              {sbPreview && sbPreview.billingItems.length === 0 ? (
                <p className="text-xs text-gray-400 pl-5">課金項目なし</p>
              ) : (
                <div className="space-y-1 pl-5">
                  {sbPreview?.billingItems.map((name) => (
                    <p key={name} className="text-sm text-gray-700">・{name}</p>
                  ))}
                </div>
              )}
            </div>

            {/* 右列: マスタ未登録項目（課金/非課金を選択して登録） */}
            {hasUnknownItems && (
              <div className="border-l pl-6">
                <p className="text-sm font-semibold text-amber-700 mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  マスタ未登録項目 — 区分を選択してください
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  選択後「登録してインポート」で一括登録されます。「スキップ」は今回の取込対象から除外されます。
                </p>
                <div className="space-y-2">
                  {unknownClassifications.map((item, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg border px-3 py-2 ${item.skip ? "opacity-40 bg-gray-50" : "bg-white"}`}
                    >
                      <p className="text-sm text-gray-800 mb-1.5 font-medium">{item.itemName}</p>
                      <div className="flex gap-1.5">
                        {[
                          { label: "課金", value: true, isSkip: false },
                          { label: "非課金", value: false, isSkip: false },
                          { label: "スキップ", value: false, isSkip: true },
                        ].map(({ label, value, isSkip }) => {
                          const active = isSkip ? item.skip : !item.skip && item.isBillable === value;
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() =>
                                setUnknownClassifications((prev) =>
                                  prev.map((c, i) =>
                                    i === idx
                                      ? isSkip
                                        ? { ...c, skip: true }
                                        : { ...c, isBillable: value, skip: false }
                                      : c
                                  )
                                )
                              }
                              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                                active
                                  ? isSkip
                                    ? "bg-gray-500 text-white border-gray-500"
                                    : value
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-gray-700 text-white border-gray-700"
                                  : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSbPreview(null)} disabled={loading}>
              キャンセル
            </Button>
            <Button onClick={handleConfirmImport} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {hasUnknownItems ? "登録してインポート" : "確認してインポート"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CDR CSV（IP回線） */}
      <Card className="border-indigo-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-indigo-600" />
            CDR 通話明細CSV
            <Badge variant="secondary" className="text-xs">IP回線</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-gray-500 space-y-1">
            <p>※ 複数ファイルを同時にアップロードできます（1ファイル = 1請求アカウント）。利用月はファイル内の「利用月」列から自動判定されます。</p>
            <p>※ 取り込みは<span className="font-medium text-gray-700">差分投入</span>です。まったく同じファイルは自動でスキップされ、同一の請求アカウント×利用月で内容が異なるファイルは追加分として加算・再集計されます。</p>
          </div>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsCdrDragging(true);
            }}
            onDragLeave={() => setIsCdrDragging(false)}
            onDrop={handleCdrDrop}
            className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              isCdrDragging
                ? "border-indigo-500 bg-indigo-50"
                : "border-indigo-200 hover:border-indigo-400"
            }`}
          >
            <Upload className="h-6 w-6 text-indigo-400 mb-1" />
            <span className="text-sm text-gray-500">
              クリックまたはドラッグ&ドロップでファイルを選択（.csv / 複数可）
            </span>
            <input
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={handleCdrFilesChange}
            />
          </label>
          {cdrFiles.length > 0 && (
            <div className="space-y-1">
              {cdrFiles.map((f) => (
                <div key={f.name} className="flex items-center justify-between p-2 bg-indigo-50 rounded border border-indigo-100">
                  <p className="text-xs text-indigo-800 font-mono flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {f.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeCdrFile(f.name)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <p className="text-xs text-gray-400">{cdrFiles.length}ファイル選択中</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SoftBank Excel（携帯回線） */}
      <Card className="border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-blue-600" />
            SoftBank 超過代金ファイル
            <Badge variant="secondary" className="text-xs">携帯回線</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-500">
            ※ 取り込みは<span className="font-medium text-gray-700">差分マージ</span>です。ファイルに含まれる回線（電話番号）の明細だけが更新され、含まれない回線の取り込み済みデータは保持されます。同じファイルを再取り込みしても二重計上はされません。
          </p>
          <div className="space-y-1 max-w-xs">
            <Label htmlFor="yearMonth">利用年月（SoftBank取込時必須）</Label>
            <Input
              id="yearMonth"
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
            />
          </div>
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-blue-200 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
            <Upload className="h-6 w-6 text-blue-400 mb-1" />
            <span className="text-sm text-gray-500">
              {softBankFile ? softBankFile.name : "クリックしてファイルを選択（.xlsx）"}
            </span>
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={handleSoftBankFileChange}
            />
          </label>
          {softBankFile && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-700">
                ✓ <span className="font-medium">{softBankFile.name}</span> が選択されました
              </p>
              <p className="text-xs text-gray-500 mt-1">
                インポート実行時に課金項目を確認してからインポートします
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-start gap-2">
          <Loader2 className="h-4 w-4 animate-spin mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">処理中です。完了するまでお待ちください。</p>
            <p className="text-xs text-blue-700 mt-1">
              明細が多いファイルは1分以上かかることがあります。この画面を閉じたり、他の操作をしたりしないでください。
              処理中は他の利用者の操作も待たされます。
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {(cdrResults || sbResult) && (
        <Card>
          <CardHeader>
            <CardTitle>インポート結果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cdrResults && cdrResults.map((r) => (
              <div key={r.fileName} className="border-b last:border-0 pb-4 last:pb-0">
                <p className="text-sm font-medium mb-1 flex items-center gap-1">
                  <Network className="h-4 w-4 text-indigo-600" />
                  {r.fileName}
                  {r.yearMonth && <span className="text-xs text-gray-400 ml-1">（利用月: {r.yearMonth}）</span>}
                </p>
                {r.status === "skipped" ? (
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-gray-500">スキップ</Badge>
                    <p className="text-xs text-gray-500 mt-0.5">{r.message}</p>
                  </div>
                ) : r.status === "error" ? (
                  <div className="flex items-start gap-2">
                    <Badge variant="destructive">エラー</Badge>
                    <p className="text-xs text-red-600 mt-0.5">{r.message}</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3 flex-wrap">
                      <Badge variant="default">取込 {r.importedRows}件</Badge>
                      <Badge variant="secondary">取引先 {r.tenantCount}社</Badge>
                      {(r.unmatchedNumbers?.length ?? 0) > 0 && (
                        <Badge variant="outline" className="border-amber-400 text-amber-700">
                          未紐付け {r.unmatchedNumbers!.length}番号
                        </Badge>
                      )}
                    </div>
                    {(r.unmatchedNumbers?.length ?? 0) > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-amber-700 mb-1">
                          未紐付け番号（{r.unmatchedNumbers!.length}件）— 未照合一覧（IP回線）から取引先を割り当ててください
                        </p>
                        <div className="max-h-32 overflow-y-auto bg-amber-50 border border-amber-200 rounded p-2">
                          {r.unmatchedNumbers!.map((u, i) => (
                            <p key={i} className="text-xs text-amber-800 font-mono">
                              {formatJapanesePhoneNumber(u.phoneNumber)}（{u.rowCount}行 / {u.totalSeconds}秒）
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    {(r.unknownCallTypes?.length ?? 0) > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          未対応の通話種別（取込対象外・{r.unknownCallTypes!.length}件）
                        </p>
                        <div className="max-h-24 overflow-y-auto bg-gray-50 border border-gray-200 rounded p-2">
                          {r.unknownCallTypes!.map((t, i) => (
                            <p key={i} className="text-xs text-gray-600">{t}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {sbResult && (
              <div>
                <p className="text-sm font-medium mb-1 flex items-center gap-1">
                  <Smartphone className="h-4 w-4 text-blue-600" />
                  SoftBank 携帯回線
                </p>
                {sbResult.errors && sbResult.errors.length > 0 ? (
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    {sbResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-700">{e}</p>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3">
                      <Badge variant="default">成功: {sbResult.success}件</Badge>
                      {sbResult.unmatched.length > 0 && (
                        <Badge variant="secondary">未照合: {sbResult.unmatched.length}件</Badge>
                      )}
                    </div>
                    {sbResult.unmatched.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-amber-700 mb-1">
                          未照合電話番号（{sbResult.unmatched.length}件）— マスタ管理で登録してください
                        </p>
                        <div className="max-h-32 overflow-y-auto bg-amber-50 border border-amber-200 rounded p-2">
                          {sbResult.unmatched.map((u, i) => (
                            <p key={i} className="text-xs text-amber-800 font-mono">{u}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 取込済みCDRファイル一覧（二重取込の防止用） */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-gray-500" />
            取込済みのCDRファイル
            {importedFiles && (
              <Badge variant="secondary" className="text-xs">{importedFiles.length}件</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-3">
            ※ まったく同じ内容のファイルは自動でスキップされます。ただし手動で分割したファイルは
            別ファイル扱いになり、分割前と分割後を両方取り込むと二重に加算されます。取込済みかどうかはここで確認してください。
            大きいファイルは自動で圧縮して送信されるため、分割は不要です。
          </p>
          {importedFiles === null ? (
            <p className="text-xs text-gray-400">読み込み中...</p>
          ) : importedFiles.length === 0 ? (
            <p className="text-xs text-gray-400">まだ取り込まれたファイルはありません</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="border-b">
                    <th className="text-left px-3 py-2 font-medium text-gray-600">ファイル名</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">請求アカウント</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">利用年月</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">明細行数</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">取込日時</th>
                  </tr>
                </thead>
                <tbody>
                  {importedFiles.map((f) => (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-800">{f.fileName}</td>
                      <td className="px-3 py-2 text-gray-600">{f.billingAccount ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {f.yearMonth ? `${f.yearMonth.split("-")[0]}年${Number(f.yearMonth.split("-")[1])}月` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">
                        {f.rowCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {formatJstDateTime(f.importedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <Button onClick={handleImport} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          インポート実行
        </Button>
      </div>
    </div>
  );
}
