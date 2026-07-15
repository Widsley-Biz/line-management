"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, Plus, Pencil, RotateCcw } from "lucide-react";
import { TenantCombobox } from "@/components/tenant-combobox";

type Rates = {
  fixedRate: number;
  mobileRate: number;
  naviSecRate: number;
  naviAmountRate: number;
};

type Override = Rates & {
  tenantId: string;
  companyName: string;
};

type Tenant = { id: string; companyName: string };

const RATE_FIELDS: { key: keyof Rates; label: string; unit: string }[] = [
  { key: "fixedRate", label: "① 固定", unit: "円/秒" },
  { key: "mobileRate", label: "② 携帯", unit: "円/秒" },
  { key: "naviSecRate", label: "③ ナビ（秒課金）", unit: "円/秒" },
  { key: "naviAmountRate", label: "④ ナビ（金額課金）", unit: "倍" },
];

function RateInputs({ defaults }: { defaults: Rates }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {RATE_FIELDS.map(({ key, label, unit }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs">{label}（{unit}）</Label>
          <Input
            name={key}
            type="number"
            step="any"
            min="0"
            defaultValue={defaults[key]}
            required
            className="h-8 text-sm"
          />
        </div>
      ))}
    </div>
  );
}

export function IpTariffsClient({
  defaultTariff,
  overrides,
  tenants,
}: {
  defaultTariff: Rates;
  overrides: Override[];
  tenants: Tenant[];
}) {
  const [editingDefault, setEditingDefault] = useState(false);
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Override | null>(null);
  const [newTenantId, setNewTenantId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 上書き未設定の取引先のみ新規追加候補にする
  const overriddenIds = new Set(overrides.map((o) => o.tenantId));
  const availableTenants = tenants.filter((t) => !overriddenIds.has(t.id));

  async function submitRates(
    form: HTMLFormElement,
    tenantId: string | null
  ) {
    setIsSubmitting(true);
    setError(null);
    const body = {
      tenantId,
      fixedRate: (form.elements.namedItem("fixedRate") as HTMLInputElement).value,
      mobileRate: (form.elements.namedItem("mobileRate") as HTMLInputElement).value,
      naviSecRate: (form.elements.namedItem("naviSecRate") as HTMLInputElement).value,
      naviAmountRate: (form.elements.namedItem("naviAmountRate") as HTMLInputElement).value,
    };
    const res = await fetch("/api/ip/tariffs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "保存に失敗しました");
      setIsSubmitting(false);
      return;
    }
    window.location.reload();
  }

  async function handleRemoveOverride(tenantId: string, companyName: string) {
    if (!confirm(`${companyName} の上書きタリフを解除してデフォルトに戻しますか？`)) return;
    await fetch("/api/ip/tariffs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">タリフ設定</h1>
        <p className="text-sm text-gray-500 mt-1">
          通話種別4パターンの単価を管理します（取引先別の上書きが優先されます）
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* デフォルトタリフ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            デフォルトタリフ
          </CardTitle>
          {!editingDefault && (
            <Button size="sm" variant="outline" onClick={() => setEditingDefault(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />編集
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editingDefault ? (
            <form
              onSubmit={(e) => { e.preventDefault(); submitRates(e.currentTarget, null); }}
              className="space-y-4"
            >
              <RateInputs defaults={defaultTariff} />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? "保存中..." : "保存する"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditingDefault(false)}>
                  キャンセル
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {RATE_FIELDS.map(({ key, label, unit }) => (
                <div key={key} className="p-3 bg-gray-50 rounded-lg border">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-xl font-bold mt-1">
                    {defaultTariff[key]}
                    <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 取引先別タリフ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">取引先別タリフ（上書き設定）</CardTitle>
          <Button
            size="sm"
            onClick={() => { setEditTarget(null); setNewTenantId(null); setShowOverrideForm(true); }}
            disabled={availableTenants.length === 0}
          >
            <Plus className="h-4 w-4 mr-1" />上書き追加
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {(showOverrideForm || editTarget) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const tenantId = editTarget ? editTarget.tenantId : newTenantId;
                if (!tenantId) return;
                submitRates(form, tenantId);
              }}
              className="p-4 bg-blue-50 border border-blue-100 rounded-lg space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">取引先 *</Label>
                  {editTarget ? (
                    <p className="text-sm font-medium py-1.5">{editTarget.companyName}</p>
                  ) : (
                    <TenantCombobox
                      tenants={availableTenants}
                      placeholder="取引先を検索..."
                      onChange={(t) => setNewTenantId(t?.id ?? null)}
                    />
                  )}
                </div>
              </div>
              <RateInputs defaults={editTarget ?? defaultTariff} />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isSubmitting || (!editTarget && !newTenantId)}>
                  {isSubmitting ? "保存中..." : editTarget ? "更新する" : "登録する"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => { setShowOverrideForm(false); setEditTarget(null); setNewTenantId(null); }}
                >
                  キャンセル
                </Button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500">
                  <th className="text-left py-2 pr-4">会社名</th>
                  <th className="text-right py-2 pr-4">① 固定（円/秒）</th>
                  <th className="text-right py-2 pr-4">② 携帯（円/秒）</th>
                  <th className="text-right py-2 pr-4">③ ナビ秒（円/秒）</th>
                  <th className="text-right py-2 pr-4">④ ナビ金額（倍）</th>
                  <th className="text-left py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {overrides.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      上書き設定はありません（全取引先にデフォルトタリフが適用されます）
                    </td>
                  </tr>
                ) : (
                  overrides.map((o) => (
                    <tr key={o.tenantId} className="border-b hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium">{o.companyName}</td>
                      <td className="py-2 pr-4 text-right font-mono">{o.fixedRate}</td>
                      <td className="py-2 pr-4 text-right font-mono">{o.mobileRate}</td>
                      <td className="py-2 pr-4 text-right font-mono">{o.naviSecRate}</td>
                      <td className="py-2 pr-4 text-right font-mono">{o.naviAmountRate}</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => { setEditTarget(o); setShowOverrideForm(false); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-gray-500 hover:text-red-600"
                            title="解除してデフォルトに戻す"
                            onClick={() => handleRemoveOverride(o.tenantId, o.companyName)}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />解除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            ※ タリフ変更は変更後に取り込んだCDRから適用されます
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
