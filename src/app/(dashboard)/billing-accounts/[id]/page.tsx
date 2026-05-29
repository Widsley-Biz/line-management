import { db } from "@/lib/db";
import {
  billingAccounts,
  channelGroups,
  phoneNumbers,
  tenants,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

async function updateBillingAccount(id: string, formData: FormData) {
  "use server";
  const billingCode = formData.get("billingCode") as string;
  const name = formData.get("name") as string;
  const ipAddress = (formData.get("ipAddress") as string) || null;
  const status = formData.get("status") as "active" | "archived";
  const notes = (formData.get("notes") as string) || null;

  await db
    .update(billingAccounts)
    .set({
      billingCode,
      name,
      ipAddress,
      status,
      notes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(billingAccounts.id, id));

  redirect(`/billing-accounts/${id}`);
}

export default async function BillingAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [account] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.id, id))
    .limit(1);

  if (!account) notFound();

  // Get channel groups with their phone numbers
  const groups = await db
    .select({
      id: channelGroups.id,
      label: channelGroups.label,
      contractCh: channelGroups.contractCh,
      tenantId: channelGroups.tenantId,
      tenantName: tenants.companyName,
      status: channelGroups.status,
    })
    .from(channelGroups)
    .leftJoin(tenants, eq(channelGroups.tenantId, tenants.id))
    .where(eq(channelGroups.billingAccountId, id))
    .orderBy(channelGroups.label);

  // Get all phone numbers under this billing account
  const phones = await db
    .select({
      id: phoneNumbers.id,
      number: phoneNumbers.number,
      freeCall: phoneNumbers.freeCall,
      category: phoneNumbers.category,
      contractStatus: phoneNumbers.contractStatus,
      applyDate: phoneNumbers.applyDate,
      cancelDate: phoneNumbers.cancelDate,
      chControl: phoneNumbers.chControl,
      notes: phoneNumbers.notes,
      groupId: phoneNumbers.channelGroupId,
      groupLabel: channelGroups.label,
    })
    .from(phoneNumbers)
    .innerJoin(channelGroups, eq(phoneNumbers.channelGroupId, channelGroups.id))
    .where(eq(channelGroups.billingAccountId, id))
    .orderBy(channelGroups.label, phoneNumbers.category, phoneNumbers.number);

  const updateAction = updateBillingAccount.bind(null, id);

  // Group phones by channel group for display
  const phonesByGroup = new Map<string, typeof phones>();
  for (const p of phones) {
    const arr = phonesByGroup.get(p.groupId) ?? [];
    arr.push(p);
    phonesByGroup.set(p.groupId, arr);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/billing-accounts" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">
            {account.billingCode}
          </h1>
          <p className="text-sm text-gray-500">{account.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Edit Form */}
        <Card>
          <CardHeader>
            <CardTitle>請求アカウント編集</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateAction} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="billingCode">請求ID</Label>
                <Input
                  id="billingCode"
                  name="billingCode"
                  defaultValue={account.billingCode}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="name">請求アカウント名</Label>
                <Input id="name" name="name" defaultValue={account.name} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ipAddress">AD1 IPアドレス</Label>
                <Input
                  id="ipAddress"
                  name="ipAddress"
                  defaultValue={account.ipAddress ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="status">ステータス</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={account.status}
                  className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="active">有効</option>
                  <option value="archived">アーカイブ</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">備考</Label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  defaultValue={account.notes ?? ""}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <Button type="submit">保存する</Button>
            </form>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>サマリー</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">請求ID</span>
                <span className="font-mono font-medium">{account.billingCode}</span>
              </div>
              {account.ipAddress && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">IPアドレス</span>
                  <span className="font-mono">{account.ipAddress}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">チャンネルグループ数</span>
                <span className="font-medium">{groups.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">電話番号数</span>
                <span className="font-medium">{phones.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">ステータス</span>
                <Badge variant={account.status === "active" ? "default" : "secondary"}>
                  {account.status === "active" ? "有効" : "アーカイブ"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Channel Groups & Phone Numbers */}
      {groups.map((g) => {
        const groupPhones = phonesByGroup.get(g.id) ?? [];
        const activeCount = groupPhones.filter(
          (p) => p.contractStatus === "契約中"
        ).length;

        return (
          <Card key={g.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{g.label}</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">
                    契約ch: {g.contractCh} / 番号数: {groupPhones.length} (契約中:
                    {activeCount})
                    {g.tenantName && (
                      <span>
                        {" "}
                        / 取引先:{" "}
                        <Link
                          href={`/tenants/${g.tenantId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {g.tenantName}
                        </Link>
                      </span>
                    )}
                  </p>
                </div>
                <Badge variant={g.status === "active" ? "default" : "secondary"}>
                  {g.status === "active" ? "有効" : "アーカイブ"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      電話番号
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      区分
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      ステータス
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      フリーコール
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">
                      ch制御
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      適用日
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      解約日
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupPhones.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-gray-400">
                        電話番号なし
                      </td>
                    </tr>
                  )}
                  {groupPhones.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-4 py-2 font-mono">{p.number}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline">{p.category}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            p.contractStatus === "契約中" ? "default" : "secondary"
                          }
                        >
                          {p.contractStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {p.freeCall || "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {p.chControl != null ? `${p.chControl}ch` : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {p.applyDate || "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {p.cancelDate || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
