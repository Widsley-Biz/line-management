"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Network, Smartphone, ArrowRight, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import { formatYen } from "@/lib/format";

interface BillingAccount {
  id: string;
  billingCode: string;
  name: string;
  totalCh: number;
}

interface MobileLine {
  tenantId: string;
  tenantName: string;
  totalLines: number;
  activeLines: number;
}

interface MobileUsageStat {
  totalLines: number;
  sfPending: number;
}

interface Props {
  ym: string;
  accountList: BillingAccount[];
  sfPending: number;
  inputDone: number;
  activeTenants: number;
  grossProfit: number;
  totalRevenue: number;
  totalCost: number;
  mobileStat: MobileUsageStat;
  mobileLines: MobileLine[];
}

export function DashboardTabs({
  ym,
  accountList,
  sfPending,
  inputDone,
  activeTenants,
  grossProfit,
  totalRevenue,
  totalCost,
  mobileStat,
  mobileLines,
}: Props) {
  const [tab, setTab] = useState<"ip" | "mobile">("ip");

  return (
    <div>
      {/* タブ切り替え */}
      <div className="flex gap-1 mb-6 border-b">
        <button
          onClick={() => setTab("ip")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "ip"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Network className="h-4 w-4" />
          IP回線
        </button>
        <button
          onClick={() => setTab("mobile")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "mobile"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Smartphone className="h-4 w-4" />
          携帯回線
          {mobileStat.sfPending > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 font-semibold">
              {mobileStat.sfPending}
            </span>
          )}
        </button>
      </div>

      {/* IP回線タブ */}
      {tab === "ip" && (
        <div className="space-y-4">
          {/* IP回線用カード：使用量入力済み・粗利概算 */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  使用量入力済み
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {inputDone}
                  <span className="text-lg text-gray-400">/{activeTenants}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">テナント</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  粗利概算
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatYen(grossProfit)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  売上: {formatYen(totalRevenue)} / 原価: {formatYen(totalCost)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* IP回線：SF送信待ち・請求アカウントch状況 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  SF送信待ち
                </CardTitle>
                <Link
                  href={`/billing/${ym}`}
                  className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
                >
                  一覧へ <ArrowRight className="h-4 w-4" />
                </Link>
              </CardHeader>
              <CardContent>
                {sfPending === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">送信待ちはありません</p>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <span className="text-sm font-medium text-amber-800">
                      {ym.replace("-", "年")}月分
                    </span>
                    <Badge variant="outline" className="border-amber-400 text-amber-700">
                      {sfPending}件 未送信
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">請求アカウントch状況</CardTitle>
                <Link
                  href="/billing-accounts"
                  className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
                >
                  一覧へ <ArrowRight className="h-4 w-4" />
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {accountList.slice(0, 5).map((a) => (
                    <div key={a.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Link
                          href={`/billing-accounts/${a.id}`}
                          className="font-mono text-blue-600 hover:underline"
                        >
                          {a.billingCode}
                        </Link>
                        <span className="text-gray-500 text-xs truncate ml-2 max-w-[200px]">
                          {a.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: "100%" }} />
                        </div>
                        <span className="text-xs text-gray-500 w-16 text-right">
                          {Number(a.totalCh)}ch
                        </span>
                      </div>
                    </div>
                  ))}
                  {accountList.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">
                      請求アカウントのデータがありません
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 携帯回線タブ */}
      {tab === "mobile" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                SF送信待ち
              </CardTitle>
              <Link
                href={`/mobile/billing/${ym}`}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
              >
                一覧へ <ArrowRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {mobileStat.sfPending === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">送信待ちはありません</p>
              ) : (
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <span className="text-sm font-medium text-amber-800">
                    {ym.replace("-", "年")}月分
                  </span>
                  <Badge variant="outline" className="border-amber-400 text-amber-700">
                    {mobileStat.sfPending}件 未送信
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">携帯回線 契約状況</CardTitle>
              <Link
                href="/mobile/master"
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
              >
                一覧へ <ArrowRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {mobileLines.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  携帯回線のデータがありません
                </p>
              ) : (
                <div className="space-y-3">
                  {mobileLines.slice(0, 5).map((m) => (
                    <div key={m.tenantId} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate max-w-[200px]">{m.tenantName}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          契約{m.totalLines}回線
                        </Badge>
                        <Badge
                          variant={m.activeLines === m.totalLines ? "default" : "outline"}
                          className="text-xs"
                        >
                          有効 {m.activeLines}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}