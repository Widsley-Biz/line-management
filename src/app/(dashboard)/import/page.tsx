import { ImportForm } from "./import-form";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">CSVインポート</h1>
        <p className="text-sm text-gray-500 mt-1">
          CDR通話明細CSV（IP回線）・SoftBank超過代金ファイル（携帯回線）を取り込みます
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
