import { Fragment } from "react";
import { db } from "@/lib/db";
import {
  monthlyUsages,
  tenants,
  tenantPacks,
  packs,
  callLogs,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatYen, formatYearMonth, formatSeconds } from "@/lib/format";
import { ArrowLeft, Download } from "lucide-react";
import { SendSfButton } from "../send-sf-button";
import { BillingDetailNav } from "@/components/billing-detail-nav";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { calculateMonthlyBilling } from "@/lib/billing";

async function deleteCallLog(formData: FormData) {
  "use server";
  const logId = formData.get("logId") as string;
  const tenantId = formData.get("tenantId") as string;
  const yearMonth = formData.get("yearMonth") as string;
  await db.delete(callLogs).where(and(eq(callLogs.id, logId), eq(callLogs.source, "手動入力")));
  await calculateMonthlyBilling(tenantId, yearMonth);
  redirect(`/billing/${yearMonth}/${tenantId}`);
}

async function updateCallLog(formData: FormData) {
  "use server";
  const logId = formData.get("logId") as string;
  const tenantId = formData.get("tenantId") as string;
  const yearMonth = formData.get("yearMonth") as string;
  const callDate = formData.get("callDate") as string;
  const phoneNumber = (formData.get("phoneNumber") as string) || "手動入力";
  const destinationNumber = (formData.get("destinationNumber") as string) || null;
  const destinationType = formData.get("destinationType") as "固定" | "携帯";
  const durationSeconds = parseInt(formData.get("durationSeconds") as string) || 0;
  const cost = parseFloat(formData.get("cost") as string) || 0;

  await db.update(callLogs).set({
    callDate, phoneNumber, destinationNumber, destinationType, durationSeconds, cost,
  }).where(and(eq(callLogs.id, logId), eq(callLogs.source, "手動入力")));
  await calculateMonthlyBilling(tenantId, yearMonth);
  redirect(`/billing/${yearMonth}/${tenantId}`);
}

export default async function BillingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ yearMonth: string; tenantId: string }>;
  searchParams: Promise<{ editLog?: string }>;
}) {
  const { yearMonth, tenantId } = await params;
  const { editLog } = await searchParams;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) notFound();

  const [usage] = await db
    .select()
    .from(monthlyUsages)
    .where(and(eq(monthlyUsages.tenantId, tenantId), eq(monthlyUsages.yearMonth, yearMonth)))
    .limit(1);

  const packRows = await db
    .select({
      id: tenantPacks.id,
      quantity: tenantPacks.quantity,
      startMonth: tenantPacks.startMonth,
      endMonth: tenantPacks.endMonth,
      packName: packs.name,
      packPrice: packs.price,
      packCredit: packs.credit,
      bonusRate: packs.bonusRate,
    })
    .from(tenantPacks)
    .innerJoin(packs, eq(tenantPacks.packId, packs.id))
    .where(eq(tenantPacks.tenantId, tenantId));

  const activePacks = packRows.filter((p) => {
    if (p.startMonth > yearMonth) return false;
    if (p.endMonth && p.endMonth < yearMonth) return false;
    return true;
  });

  const logs = await db
    .select()
    .from(callLogs)
    .where(and(eq(callLogs.tenantId, tenantId), eq(callLogs.yearMonth, yearMonth)))
    .orderBy(callLogs.callDate);

  const manualCount = logs.filter((l) => l.source === "手動入力").length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href={`/billing/${yearMonth}`} className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{tenant.companyName}</h1>
          <p className="text-sm text-gray-500">{formatYearMonth(yearMonth)} 請求詳細</p>
        </div>
        <div className="flex items-center gap-2">
          <BillingDetailNav yearMonth={yearMonth} tenantId={tenantId} />
          <a
            href={`/api/billing/export?yearMonth=${yearMonth}&tenantId=${tenantId}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-input bg-background text-sm text-gray-600 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
        </div>
      </div>

      {!usage ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-400">
            {yearMonth}のデータがありません
          </CardContent>
        </Card>
      ) : (
        <>
          {/* SF Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">SFステータス:</span>
              <Badge
                variant={
                  usage.sfStatus === "送信済" ? "default"
                  : usage.sfStatus === "未送信" ? "secondary"
                  : usage.sfStatus === "エラー" ? "destructive"
                  : "outline"
                }
              >
                {usage.sfStatus}
              </Badge>
              {usage.sfSentAt && (
                <span className="text-xs text-gray-400">送信日時: {usage.sfSentAt}</span>
              )}
            </div>
            {usage.sfStatus === "未送信" && tenant.sfOpportunityId && (
              <SendSfButton
                tenants={[{ tenantId, companyName: tenant.companyName }]}
                yearMonth={yearMonth}
              />
            )}
            {tenant.sfOpportunityId && (
              process.env.NEXT_PUBLIC_SF_ORG_URL ? (
                <a
                  href={`${process.env.NEXT_PUBLIC_SF_ORG_URL}/${tenant.sfOpportunityId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline font-mono"
                >
                  {tenant.sfOpportunityId} →
                </a>
              ) : (
                <span className="text-xs text-gray-500 font-mono">{tenant.sfOpportunityId}</span>
              )
            )}
            {usage.sfStatus === "未送信" && !tenant.sfOpportunityId && (
              <span className="text-xs text-amber-600">SF商談IDが未設定です</span>
            )}
          </div>

          {usage.sfErrorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              エラー: {usage.sfErrorMessage}
            </div>
          )}

          {/* Pack Breakdown */}
          <Card>
            <CardHeader><CardTitle>パック構成</CardTitle></CardHeader>
            <CardContent>
              {activePacks.length === 0 ? (
                <p className="text-sm text-gray-400">パック設定なし</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 text-gray-600">パック名</th>
                      <th className="text-right py-2 text-gray-600">数量</th>
                      <th className="text-right py-2 text-gray-600">月額</th>
                      <th className="text-right py-2 text-gray-600">クレジット</th>
                      <th className="text-right py-2 text-gray-600">ボーナス率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePacks.map((p) => (
                      <tr key={p.id} className="border-b">
                        <td className="py-2">{p.packName}</td>
                        <td className="py-2 text-right">{p.quantity}</td>
                        <td className="py-2 text-right">{formatYen(p.packPrice * p.quantity)}</td>
                        <td className="py-2 text-right text-green-700">{formatYen(p.packCredit * p.quantity)}</td>
                        <td className="py-2 text-right">{(p.bonusRate * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                    <tr className="font-medium">
                      <td className="py-2">合計</td>
                      <td></td>
                      <td className="py-2 text-right">{formatYen(usage.totalPackPrice)}</td>
                      <td className="py-2 text-right text-green-700">{formatYen(usage.totalCredit)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Call Charges */}
          <Card>
            <CardHeader><CardTitle>通話料金</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">固定宛</p>
                    <p className="font-medium">{formatSeconds(usage.fixedSeconds)}</p>
                    <p className="text-sm text-gray-600">{formatYen(usage.fixedCallCharge)}</p>
                    <p className="text-xs text-gray-400">¥0.06/秒</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">携帯宛</p>
                    <p className="font-medium">{formatSeconds(usage.mobileSeconds)}</p>
                    <p className="text-sm text-gray-600">{formatYen(usage.mobileCallCharge)}</p>
                    <p className="text-xs text-gray-400">¥0.25/秒</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-500 mb-1">IP通話料合計</p>
                    <p className="font-bold text-blue-700">{formatYen(usage.ipCallCharge)}</p>
                  </div>
                </div>
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">IP通話料</span>
                    <span>{formatYen(usage.ipCallCharge)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-700">
                    <span>クレジット充当</span>
                    <span>- {formatYen(usage.usedCredit)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium border-t pt-2">
                    <span>超過料金（合計）</span>
                    <span className={usage.overageCharge > 0 ? "text-red-600" : "text-gray-400"}>
                      {formatYen(usage.overageCharge)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {usage.overageCharge > 0 && (
            <Card>
              <CardHeader><CardTitle>超過料金内訳（SF送信対象）</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">CC_01 固定宛超過（01t2t000000Bj66AAC）</p>
                      <p className="text-xs text-gray-500">
                        按分率: {usage.ipCallCharge > 0 ? ((usage.fixedCallCharge / usage.ipCallCharge) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                    <span className="font-bold text-red-700">{formatYen(usage.overageFixed)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">CC_02 携帯宛超過（01t2t000000Bj67AAC）</p>
                      <p className="text-xs text-gray-500">
                        按分率: {usage.ipCallCharge > 0 ? ((usage.mobileCallCharge / usage.ipCallCharge) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                    <span className="font-bold text-red-700">{formatYen(usage.overageMobile)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Financial Summary */}
          <Card>
            <CardHeader><CardTitle>損益サマリー</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">パック売上</span>
                  <span>{formatYen(usage.totalPackPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">超過料金</span>
                  <span>{formatYen(usage.overageCharge)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-600">売上合計</span>
                  <span className="font-medium">{formatYen(usage.totalPackPrice + usage.overageCharge)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>原価（キャリア）</span>
                  <span>- {formatYen(usage.rawCost)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>粗利</span>
                  <span className={usage.grossProfit >= 0 ? "text-green-700" : "text-red-600"}>
                    {formatYen(usage.grossProfit)}
                  </span>
                </div>
                {usage.dataSource && (
                  <p className="text-xs text-gray-400 pt-2">データソース: {usage.dataSource}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Call Logs */}
      <Card>
        <CardHeader>
          <CardTitle>
            通話ログ（{logs.length}件
            {manualCount > 0 && <span className="text-sm font-normal text-gray-500 ml-1">うち手動入力 {manualCount}件</span>}
            ）
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">通話ログがありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">通話日</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">発信番号</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">着信番号</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">種別</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">通話時間</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">金額</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">ソース</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <Fragment key={l.id}>
                      <tr className={`border-b hover:bg-gray-50 ${l.source === "手動入力" ? "bg-amber-50/40" : ""}`}>
                        <td className="px-4 py-2 font-mono text-xs">{l.callDate ?? "-"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{l.phoneNumber ?? "-"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{l.destinationNumber ?? "-"}</td>
                        <td className="px-4 py-2">
                          <Badge variant={l.destinationType === "携帯" ? "secondary" : "outline"} className="text-xs">
                            {l.destinationType}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right text-xs">{l.durationSeconds}秒</td>
                        <td className="px-4 py-2 text-right text-xs">¥{l.cost.toLocaleString()}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{l.source}</td>
                        <td className="px-4 py-2">
                          {l.source === "手動入力" && (
                            <div className="flex gap-1">
                              <a
                                href={`/billing/${yearMonth}/${tenantId}?editLog=${l.id}`}
                                className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                              >
                                編集
                              </a>
                              <form action={deleteCallLog}>
                                <input type="hidden" name="logId" value={l.id} />
                                <input type="hidden" name="tenantId" value={tenantId} />
                                <input type="hidden" name="yearMonth" value={yearMonth} />
                                <ConfirmDeleteButton
                                  message="このログを削除して請求を再計算しますか？"
                                  className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700"
                                >
                                  削除
                                </ConfirmDeleteButton>
                              </form>
                            </div>
                          )}
                        </td>
                      </tr>
                      {editLog === l.id && l.source === "手動入力" && (
                        <tr className="bg-blue-50 border-b">
                          <td colSpan={8} className="px-4 py-4">
                            <p className="text-xs font-medium text-blue-700 mb-3">通話ログ編集</p>
                            <form action={updateCallLog} className="grid grid-cols-3 gap-3 md:grid-cols-6">
                              <input type="hidden" name="logId" value={l.id} />
                              <input type="hidden" name="tenantId" value={tenantId} />
                              <input type="hidden" name="yearMonth" value={yearMonth} />
                              <div className="space-y-1">
                                <Label className="text-xs">通話日</Label>
                                <Input name="callDate" type="date" defaultValue={l.callDate ?? ""} className="h-8 text-xs" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">種別</Label>
                                <select name="destinationType" defaultValue={l.destinationType} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                                  <option value="固定">固定</option>
                                  <option value="携帯">携帯</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">発信番号</Label>
                                <Input name="phoneNumber" defaultValue={l.phoneNumber ?? ""} className="h-8 text-xs" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">着信番号</Label>
                                <Input name="destinationNumber" defaultValue={l.destinationNumber ?? ""} className="h-8 text-xs" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">通話時間(秒)</Label>
                                <Input name="durationSeconds" type="number" defaultValue={l.durationSeconds} className="h-8 text-xs" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">金額(円)</Label>
                                <Input name="cost" type="number" step="0.01" defaultValue={l.cost} className="h-8 text-xs" />
                              </div>
                              <div className="col-span-3 md:col-span-6 flex gap-2">
                                <Button type="submit" size="sm">保存して再計算</Button>
                                <a
                                  href={`/billing/${yearMonth}/${tenantId}`}
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
