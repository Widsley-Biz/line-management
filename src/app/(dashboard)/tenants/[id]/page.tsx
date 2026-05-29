import { db } from "@/lib/db";
import {
  tenants,
  users,
  tenantAssignments,
  phoneNumbers,
  channelGroups,
  billingAccounts,
  tenantPacks,
  packs,
  monthlyUsages,
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
import { randomUUID } from "crypto";

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

async function addAssignment(tenantId: string, formData: FormData) {
  "use server";
  const phoneNumberId = formData.get("phoneNumberId") as string;
  const allocatedCh = parseInt(formData.get("allocatedCh") as string, 10) || 0;
  const startMonth = formData.get("startMonth") as string;
  const endMonth = (formData.get("endMonth") as string) || null;
  const unitChStatus = (formData.get("unitChStatus") as string) || "不要";

  if (!phoneNumberId || !startMonth) return;

  const now = new Date().toISOString();
  await db.insert(tenantAssignments).values({
    id: randomUUID(),
    tenantId,
    phoneNumberId,
    allocatedCh,
    startMonth,
    endMonth,
    unitChStatus: unitChStatus as "不要" | "検討中" | "対応中" | "完了",
    createdAt: now,
    updatedAt: now,
  });

  redirect(`/tenants/${tenantId}?tab=assignments`);
}

async function updateAssignment(tenantId: string, assignmentId: string, formData: FormData) {
  "use server";
  const allocatedCh = parseInt(formData.get("allocatedCh") as string, 10) || 0;
  const unitChStatus = formData.get("unitChStatus") as string;
  const endMonth = (formData.get("endMonth") as string) || null;
  await db.update(tenantAssignments).set({
    allocatedCh,
    unitChStatus: unitChStatus as "不要" | "検討中" | "対応中" | "完了",
    endMonth: endMonth || null,
    updatedAt: new Date().toISOString(),
  }).where(eq(tenantAssignments.id, assignmentId));
  redirect(`/tenants/${tenantId}?tab=assignments`);
}

async function addPack(tenantId: string, formData: FormData) {
  "use server";
  const packId = formData.get("packId") as string;
  const quantity = parseInt(formData.get("quantity") as string, 10) || 1;
  const startMonth = formData.get("startMonth") as string;
  const endMonth = (formData.get("endMonth") as string) || null;

  if (!packId || !startMonth) return;

  await db.insert(tenantPacks).values({
    id: randomUUID(),
    tenantId,
    packId,
    quantity,
    startMonth,
    endMonth,
    createdAt: new Date().toISOString(),
  });

  redirect(`/tenants/${tenantId}?tab=packs`);
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

  const [userList, assignmentRows, packRows, usageRows, availablePhones, allPacks] =
    await Promise.all([
      db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name),
      db
        .select({
          id: tenantAssignments.id,
          phoneNumber: phoneNumbers.number,
          phoneNumberId: tenantAssignments.phoneNumberId,
          billingCode: billingAccounts.billingCode,
          allocatedCh: tenantAssignments.allocatedCh,
          freeCall: phoneNumbers.freeCall,
          startMonth: tenantAssignments.startMonth,
          endMonth: tenantAssignments.endMonth,
          unitChStatus: tenantAssignments.unitChStatus,
        })
        .from(tenantAssignments)
        .innerJoin(phoneNumbers, eq(tenantAssignments.phoneNumberId, phoneNumbers.id))
        .innerJoin(channelGroups, eq(phoneNumbers.channelGroupId, channelGroups.id))
        .innerJoin(billingAccounts, eq(channelGroups.billingAccountId, billingAccounts.id))
        .where(eq(tenantAssignments.tenantId, id))
        .orderBy(desc(tenantAssignments.startMonth)),
      db
        .select({
          id: tenantPacks.id,
          quantity: tenantPacks.quantity,
          startMonth: tenantPacks.startMonth,
          endMonth: tenantPacks.endMonth,
          packName: packs.name,
          packPrice: packs.price,
          packCredit: packs.credit,
        })
        .from(tenantPacks)
        .innerJoin(packs, eq(tenantPacks.packId, packs.id))
        .where(eq(tenantPacks.tenantId, id))
        .orderBy(desc(tenantPacks.startMonth)),
      db
        .select()
        .from(monthlyUsages)
        .where(eq(monthlyUsages.tenantId, id))
        .orderBy(desc(monthlyUsages.yearMonth))
        .limit(24),
      db
        .select({
          id: phoneNumbers.id,
          number: phoneNumbers.number,
          billingCode: billingAccounts.billingCode,
        })
        .from(phoneNumbers)
        .innerJoin(channelGroups, eq(phoneNumbers.channelGroupId, channelGroups.id))
        .innerJoin(billingAccounts, eq(channelGroups.billingAccountId, billingAccounts.id))
        .orderBy(phoneNumbers.number),
      db.select().from(packs).where(eq(packs.isActive, true)).orderBy(packs.sortOrder),
    ]);

  const updateTenantAction = updateTenant.bind(null, id);
  const addAssignmentAction = addAssignment.bind(null, id);
  const addPackAction = addPack.bind(null, id);
  const updateAssignmentBase = updateAssignment.bind(null, id);

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
        <Link href={`/tenants/${id}?tab=assignments`} className={tabClass("assignments")}>
          割り当て ({assignmentRows.length})
        </Link>
        <Link href={`/tenants/${id}?tab=packs`} className={tabClass("packs")}>
          パック設定 ({packRows.length})
        </Link>
        <Link href={`/tenants/${id}?tab=billing`} className={tabClass("billing")}>
          月次請求履歴 ({usageRows.length})
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
                  <Label htmlFor="sfOpportunityId">SF商談ID</Label>
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

      {/* Assignments Tab */}
      {tab === "assignments" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>番号割り当て一覧</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">電話番号</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">請求ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">開始月</th>
                    <th colSpan={4} className="text-left px-2 py-3 font-medium text-gray-600">ch / FC / 終了月 / ユニットch / 操作</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-gray-400">割り当て番号なし</td>
                    </tr>
                  )}
                  {assignmentRows.map((a) => {
                    const updateAction = updateAssignmentBase.bind(null, a.id);
                    return (
                      <tr key={a.id} className="border-b">
                        <td className="px-4 py-2 font-mono text-sm">{a.phoneNumber}</td>
                        <td className="px-4 py-2 text-gray-500 text-sm">{a.billingCode}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{a.startMonth}</td>
                        <td colSpan={4} className="px-2 py-2">
                          <form action={updateAction} className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-gray-500 whitespace-nowrap">ch</label>
                              <input
                                name="allocatedCh"
                                type="number"
                                min="0"
                                defaultValue={a.allocatedCh}
                                className="w-16 h-7 rounded border border-input bg-background px-2 text-sm text-right"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-gray-500 whitespace-nowrap">FC</label>
                              <span className="text-xs font-mono">{a.freeCall || "—"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-gray-500 whitespace-nowrap">終了月</label>
                              <input
                                name="endMonth"
                                type="month"
                                defaultValue={a.endMonth ?? ""}
                                className="h-7 rounded border border-input bg-background px-2 text-xs"
                              />
                            </div>
                            <select
                              name="unitChStatus"
                              defaultValue={a.unitChStatus}
                              className="h-7 rounded border border-input bg-background px-2 text-xs"
                            >
                              <option value="不要">不要</option>
                              <option value="検討中">検討中</option>
                              <option value="対応中">対応中</option>
                              <option value="完了">完了</option>
                            </select>
                            <button
                              type="submit"
                              className="h-7 px-3 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                            >
                              更新
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>番号割り当て追加</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addAssignmentAction} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="phoneNumberId">電話番号 *</Label>
                    <select
                      id="phoneNumberId"
                      name="phoneNumberId"
                      required
                      className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="">選択してください</option>
                      {availablePhones.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.number} ({p.billingCode})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="allocatedCh">割り当てch数</Label>
                    <Input id="allocatedCh" name="allocatedCh" type="number" min="0" defaultValue="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="startMonth">開始月 *</Label>
                    <Input id="startMonth" name="startMonth" type="month" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="endMonth">終了月</Label>
                    <Input id="endMonth" name="endMonth" type="month" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="unitChStatus">ユニットchステータス</Label>
                  <select
                    id="unitChStatus"
                    name="unitChStatus"
                    className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="不要">不要</option>
                    <option value="検討中">検討中</option>
                    <option value="対応中">対応中</option>
                    <option value="完了">完了</option>
                  </select>
                </div>
                <Button type="submit">追加する</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Packs Tab */}
      {tab === "packs" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>パック設定一覧</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">パック名</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">数量</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">月額</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">クレジット</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">期間</th>
                  </tr>
                </thead>
                <tbody>
                  {packRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-gray-400">パック設定なし</td>
                    </tr>
                  )}
                  {packRows.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-4 py-3 font-medium">{p.packName}</td>
                      <td className="px-4 py-3 text-right">{p.quantity}</td>
                      <td className="px-4 py-3 text-right">{formatYen(p.packPrice * p.quantity)}</td>
                      <td className="px-4 py-3 text-right text-green-700">{formatYen(p.packCredit * p.quantity)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {p.startMonth} 〜 {p.endMonth ?? "現在"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>パック追加</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addPackAction} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="packId">パック *</Label>
                    <select
                      id="packId"
                      name="packId"
                      required
                      className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="">選択してください</option>
                      {allPacks.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatYen(p.price)} / クレジット{formatYen(p.credit)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="quantity">数量</Label>
                    <Input id="quantity" name="quantity" type="number" min="1" defaultValue="1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="packStartMonth">開始月 *</Label>
                    <Input id="packStartMonth" name="startMonth" type="month" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="packEndMonth">終了月</Label>
                    <Input id="packEndMonth" name="endMonth" type="month" />
                  </div>
                </div>
                <Button type="submit">追加する</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Billing History Tab */}
      {tab === "billing" && (
        <Card>
          <CardHeader>
            <CardTitle>月次請求履歴</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">月</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">パック料金</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">IP通話料</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">超過料金</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">粗利</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">SFステータス</th>
                </tr>
              </thead>
              <tbody>
                {usageRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-gray-400">請求データなし</td>
                  </tr>
                )}
                {usageRows.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/billing/${u.yearMonth}/${id}`} className="text-blue-600 hover:underline">
                        {formatYearMonth(u.yearMonth)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">{formatYen(u.totalPackPrice)}</td>
                    <td className="px-4 py-3 text-right">{formatYen(u.ipCallCharge)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={u.overageCharge > 0 ? "text-red-600 font-medium" : "text-gray-400"}>
                        {formatYen(u.overageCharge)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={u.grossProfit >= 0 ? "text-green-700" : "text-red-600"}>
                        {formatYen(u.grossProfit)}
                      </span>
                    </td>
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
