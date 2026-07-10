"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Network, Smartphone, ArrowRight, Clock } from "lucide-react";

interface IpNumberStat {
  tenantId: string;
  tenantName: string;
  totalNumbers: number;
  activeNumbers: number;
}

interface MobileLine {
  tenantId: string;
  tenantName: string;
  totalLines: number;
  activeLines: number;
}

interface Props {
  ym: string;
  ipStat: { totalNumbers: number; sfPending: number };
  ipNumbers: IpNumberStat[];
  mobileStat: { totalLines: number; sfPending: number };
  mobileLines: MobileLine[];
}

export function DashboardTabs({
  ym,
  ipStat,
  ipNumbers,
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
          {ipStat.sfPending > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 font-semibold">
              {ipStat.sfPending}
            </span>
          )}
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                SF送信待ち
              </CardTitle>
              <Link
                href={`/ip/billing/${ym}`}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
              >
                一覧へ <ArrowRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {ipStat.sfPending === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">送信待ちはありません</p>
              ) : (
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <span className="text-sm font-medium text-amber-800">
                    {ym.replace("-", "年")}月分
                  </span>
                  <Badge variant="outline" className="border-amber-400 text-amber-700">
                    {ipStat.sfPending}件 未送信
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">IP回線 契約状況</CardTitle>
              <Link
                href="/ip/master"
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
              >
                一覧へ <ArrowRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {ipNumbers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  IP回線のデータがありません
                </p>
              ) : (
                <div className="space-y-3">
                  {ipNumbers.slice(0, 5).map((n) => (
                    <div key={n.tenantId} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate max-w-[200px]">{n.tenantName}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          契約{n.totalNumbers}番号
                        </Badge>
                        <Badge
                          variant={n.activeNumbers === n.totalNumbers ? "default" : "outline"}
                          className="text-xs"
                        >
                          有効 {n.activeNumbers}
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
