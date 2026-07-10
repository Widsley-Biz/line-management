import { db } from "@/lib/db";
import {
  tenants,
  ipUsages,
  ipNumbers,
  auditLogs,
  users,
  mobileLines,
  mobileUsages,
} from "@/lib/db/schema";
import { eq, count, desc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Users, Clock, History, ArrowRight } from "lucide-react";
import { DashboardTabs } from "./dashboard-tabs";

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  return `${Math.floor(hr / 24)}日前`;
}

function actionTypeLabel(type: string) {
  const map: Record<string, string> = {
    tenant_create: "取引先登録",
    tenant_update: "取引先更新",
    user_create: "ユーザー追加",
    user_update: "ユーザー更新",
    user_delete: "ユーザー削除",
    tariff_update: "タリフ更新",
    sf_send: "SF送信",
    import: "インポート",
    action_create: "アクション登録",
    action_update: "アクション更新",
  };
  return map[type] ?? type;
}

export default async function DashboardPage() {
  const ym = currentYearMonth();

  // ── 全テナント数（IP・携帯共通） ──
  const [{ total: activeTenants }] = await db
    .select({ total: count() })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  // ── IP回線データ ──
  const ipUsageStats = await db
    .select({ sfStatus: ipUsages.sfStatus, cnt: count() })
    .from(ipUsages)
    .where(eq(ipUsages.yearMonth, ym))
    .groupBy(ipUsages.sfStatus);

  const ipSfPending = ipUsageStats
    .filter((r) => r.sfStatus === "未送信")
    .reduce((s, r) => s + Number(r.cnt), 0);

  const ipNumbersRaw = await db
    .select({
      tenantId: ipNumbers.tenantId,
      totalNumbers: count(),
      activeNumbers: sql<number>`sum(case when ${ipNumbers.status} = '契約中' then 1 else 0 end)`,
    })
    .from(ipNumbers)
    .groupBy(ipNumbers.tenantId)
    .orderBy(ipNumbers.tenantId);

  const recentLogs = await db
    .select({
      id: auditLogs.id,
      actionType: auditLogs.actionType,
      message: auditLogs.message,
      createdAt: auditLogs.createdAt,
      userName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(5);

  // ── 携帯回線データ ──
  const mobileUsageStats = await db
    .select({ sfStatus: mobileUsages.sfStatus, cnt: count() })
    .from(mobileUsages)
    .where(eq(mobileUsages.yearMonth, ym))
    .groupBy(mobileUsages.sfStatus);

  const mobileSfPending = mobileUsageStats
    .filter((r) => r.sfStatus === "未送信")
    .reduce((s, r) => s + Number(r.cnt), 0);

  // IP + 携帯 合計SF送信待ち
  const totalSfPending = ipSfPending + mobileSfPending;

  const mobileLinesRaw = await db
    .select({
      tenantId: mobileLines.tenantId,
      totalLines: count(),
      activeLines: sql<number>`sum(case when ${mobileLines.status} = '契約中' then 1 else 0 end)`,
    })
    .from(mobileLines)
    .groupBy(mobileLines.tenantId)
    .orderBy(mobileLines.tenantId);

  const tenantList = await db
    .select({ id: tenants.id, name: tenants.companyName })
    .from(tenants);

  const tenantNameMap = Object.fromEntries(tenantList.map((t) => [t.id, t.name]));

  const ipNumbersPerTenant = ipNumbersRaw.map((n) => ({
    tenantId: n.tenantId,
    tenantName: tenantNameMap[n.tenantId] ?? n.tenantId,
    totalNumbers: Number(n.totalNumbers),
    activeNumbers: Number(n.activeNumbers),
  }));

  const mobileLinesPerTenant = mobileLinesRaw.map((m) => ({
    tenantId: m.tenantId,
    tenantName: tenantNameMap[m.tenantId] ?? m.tenantId,
    totalLines: Number(m.totalLines),
    activeLines: Number(m.activeLines),
  }));

  const totalIpNumbers = ipNumbersPerTenant.reduce((s, r) => s + r.totalNumbers, 0);
  const totalMobileLines = mobileLinesPerTenant.reduce((s, r) => s + r.totalLines, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-1">
          {ym.replace("-", "年")}月の請求管理状況
        </p>
      </div>

      {/* 上部カード：有効取引先 + SF送信待ち合計のみ */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Users className="h-4 w-4" />
              有効取引先
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeTenants}</p>
            <p className="text-xs text-gray-400 mt-1">社</p>
          </CardContent>
        </Card>

        <Card className={totalSfPending > 0 ? "border-amber-300" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              SF送信待ち
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{totalSfPending}</p>
            <p className="text-xs text-gray-400 mt-1">
              件（IP: {ipSfPending} / 携帯: {mobileSfPending}）
            </p>
          </CardContent>
        </Card>
      </div>

      {/* IP回線 / 携帯回線タブ */}
      <DashboardTabs
        ym={ym}
        ipStat={{ totalNumbers: totalIpNumbers, sfPending: ipSfPending }}
        ipNumbers={ipNumbersPerTenant}
        mobileStat={{ totalLines: totalMobileLines, sfPending: mobileSfPending }}
        mobileLines={mobileLinesPerTenant}
      />

      {/* 更新履歴 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            更新履歴
          </CardTitle>
          <Link
            href="/activity"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
          >
            もっと見る <ArrowRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">履歴がありません</p>
          ) : (
            <ul className="space-y-3">
              {recentLogs.map((log) => (
                <li key={log.id} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 whitespace-nowrap">
                    {actionTypeLabel(log.actionType)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 truncate">
                      {log.message ?? `${actionTypeLabel(log.actionType)}が実行されました`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {log.userName ?? "システム"} · {relativeTime(log.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
