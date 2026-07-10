import { db } from "@/lib/db";
import {
  tenants,
  users,
  ipNumbers,
  ipUsages,
  mobileLines,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatYen, formatYearMonth } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

async function updateTenant(id: string, formData: FormData) {
  "use server";
  const companyName = formData.get("companyName") as string;
  const slug = formData.get("slug") as string;
  const sfOpportunityId = (formData.get("sfOpportunityId") as string) || null;
  const mfPartnerId = (formData.get("mfPartnerId") as string) || null;
  const assigneeId = (formData.get("assigneeId") as string) || null;
  const status = formData.get("status") as "active" | "churned";
  const notes = (formData.get("notes") as string) || null;

  await db.update(tenants).set({
    companyName, slug, sfOpportunityId, mfPartnerId,
    assigneeId: assigneeId || null, status, notes,
    updatedAt: new Date().toISOString(),
  }).where(eq(tenants.id, id));

  redirect(`/tenants/${id}?tab=info`);
}

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "info" } = await searchParams;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);

  if (!tenant) notFound();

  const [userList, ipNumberRows, mobileLineRows, ipUsageRows] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name),
    db
      .select({
        id: ipNumbers.id,
        phoneNumber: ipNumbers.phoneNumber,
        subNumber: ipNumbers.subNumber,
        status: ipNumbers.status,
        notes: ipNumbers.notes,
      })
      .from(ipNumbers)
      .where(eq(ipNumbers.tenantId, id))
      .orderBy(ipNumbers.phoneNumber),
    db
      .select({
        id: mobileLines.id,
        phoneNumber: mobileLines.phoneNumber,
        status: mobileLines.status,
        contractStart: mobileLines.contractStart,
        contractEnd: mobileLines.contractEnd,
      })
      .from(mobileLines)
      .where(eq(mobileLines.tenantId, id))
      .orderBy(mobileLines.phoneNumber),
    db
      .select()
      .from(ipUsages)
      .where(eq(ipUsages.tenantId, id))
      .orderBy(desc(ipUsages.yearMonth))
      .limit(24),
  ]);

  const updateTenantAction = updateTenant.bind(null, id);

  const assignedUserId = tenant.assigneeId;
  const assigneeName = userList.find((u) => u.id === assignedUserId)?.name;

  const tabClass = (t: string) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? "border-primary text-primary"
        : "border-transparent text-gray-500 hover:text-gray-900"
    }`;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/tenants" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{tenant.companyName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500 font-mono">{tenant.slug}</span>
            <Badge variant={tenant.status === "active" ? "default" : "secondary"}>
              {tenant.status === "active" ? "有効" : "解約"}
            </Badge>
            {assigneeName && (
              <span className="text-sm text-gray-500">担当: {assigneeName}</span>
            )}
          </div>
        </div>
      </div>

      <div className="border-b flex gap-1">
        <Link href={`/tenants/${id}?tab=info`} className={tabClass("info")}>基本情報</Link>
        <Link href={`/tenants/${id}?tab=lines`} className={tabClass("lines")}>
          回線 (IP: {ipNumberRows.length} / 携帯: {mobileLineRows.length})
        </Link>
        <Link href={`/tenants/${id}?tab=billing`} className={tabClass("billing")}>
          IP請求履歴 ({ipUsageRows.length})
        </Link>
      </div>

      {/* Info Tab */}
      {tab === "info" && (
        <Card>
          <CardHeader>
            <CardTitle>基本情報編集</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateTenantAction} className="space-y-4 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="companyName">会社名 *</Label>
                  <Input id="companyName" name="companyName" defaultValue={tenant.companyName} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="slug">取引先コード *</Label>
                  <Input id="slug" name="slug" defaultValue={tenant.slug} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sfOpportunityId">SF商談ID</Label>
                    {tenant.sfOpportunityId && (
                      process.env.NEXT_PUBLIC_SF_ORG_URL ? (
                        <a
                          href={`${process.env.NEXT_PUBLIC_SF_ORG_URL}/${tenant.sfOpportunityId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          SFで開く →
                        </a>
                      ) : null
                    )}
                  </div>
                  <Input id="sfOpportunityId" name="sfOpportunityId" defaultValue={tenant.sfOpportunityId ?? ""} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mfPartnerId">MFパートナーID</Label>
                  <Input id="mfPartnerId" name="mfPartnerId" defaultValue={tenant.mfPartnerId ?? ""} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="assigneeId">担当者</Label>
                  <select
                    id="assigneeId"
                    name="assigneeId"
                    defaultValue={tenant.assigneeId ?? ""}
                    className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">未設定</option>
                    {userList.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="status">ステータス</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={tenant.status}
                    className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="active">有効</option>
                    <option value="churned">解約</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">備考</Label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  defaultValue={tenant.notes ?? ""}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <Button type="submit">保存する</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lines Tab */}
      {tab === "lines" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>IP回線番号</CardTitle>
              <Link
                href="/ip/master"
                className="text-sm text-gray-500 hover:text-gray-900"
              >
                回線マスタで編集 →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">電話番号</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">裏番号</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {ipNumberRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-gray-400">IP回線番号なし</td>
                    </tr>
                  )}
                  {ipNumberRows.map((n) => (
                    <tr key={n.id} className="border-b">
                      <td className="px-4 py-2 font-mono">{n.phoneNumber}</td>
                      <td className="px-4 py-2 font-mono text-gray-500">{n.subNumber ?? "—"}</td>
                      <td className="px-4 py-2">
                        <Badge variant={n.status === "契約中" ? "default" : "secondary"}>
                          {n.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{n.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>携帯回線</CardTitle>
              <Link
                href="/mobile/master"
                className="text-sm text-gray-500 hover:text-gray-900"
              >
                回線マスタで編集 →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">携帯番号</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">契約開始日</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">解約日</th>
                  </tr>
                </thead>
                <tbody>
                  {mobileLineRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-gray-400">携帯回線なし</td>
                    </tr>
                  )}
                  {mobileLineRows.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="px-4 py-2 font-mono">{l.phoneNumber}</td>
                      <td className="px-4 py-2">
                        <Badge variant={l.status === "契約中" ? "default" : "secondary"}>
                          {l.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{l.contractStart ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{l.contractEnd ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* IP Billing History Tab */}
      {tab === "billing" && (
        <Card>
          <CardHeader>
            <CardTitle>IP回線 月次請求履歴</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">利用月</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">固定分</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">携帯＋ナビ分</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">合計</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">SFステータス</th>
                </tr>
              </thead>
              <tbody>
                {ipUsageRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-gray-400">請求データなし</td>
                  </tr>
                )}
                {ipUsageRows.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/ip/billing/${u.yearMonth}`} className="text-blue-600 hover:underline">
                        {formatYearMonth(u.yearMonth)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">{formatYen(u.fixedAmount)}</td>
                    <td className="px-4 py-3 text-right">{formatYen(u.mobileNaviAmount)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatYen(u.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          u.sfStatus === "送信済" ? "default"
                          : u.sfStatus === "未送信" ? "secondary"
                          : u.sfStatus === "エラー" ? "destructive"
                          : "outline"
                        }
                      >
                        {u.sfStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
