import { db } from "@/lib/db";
import { actions, tenants, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TenantCombobox } from "@/components/tenant-combobox";
import { ActionsTable } from "@/components/actions-table";

const ACTION_TYPES = ["SF送信待ち", "請求差分確認", "ユニットch対応", "その他"] as const;
type ActionType = typeof ACTION_TYPES[number];

async function updateActionStatus(formData: FormData) {
  "use server";
  const actionId = formData.get("actionId") as string;
  const status = formData.get("status") as "未着手" | "対応中" | "完了";
  const now = new Date().toISOString();
  await db
    .update(actions)
    .set({ status, resolvedAt: status === "完了" ? now : null, updatedAt: now })
    .where(eq(actions.id, actionId));
  redirect("/actions");
}

async function updateAction(formData: FormData) {
  "use server";
  const actionId = formData.get("actionId") as string;
  const type = formData.get("type") as ActionType;
  const description = formData.get("description") as string;
  const tenantId = (formData.get("tenantId") as string) || null;
  const assigneeId = (formData.get("assigneeId") as string) || null;
  const dueDate = (formData.get("dueDate") as string) || null;
  if (!type || !description) return;
  await db
    .update(actions)
    .set({ type, description, tenantId, assigneeId, dueDate, updatedAt: new Date().toISOString() })
    .where(eq(actions.id, actionId));
  redirect("/actions");
}

async function deleteAction(formData: FormData) {
  "use server";
  const actionId = formData.get("actionId") as string;
  await db.delete(actions).where(eq(actions.id, actionId));
  redirect("/actions");
}

async function createAction(formData: FormData) {
  "use server";
  const type = formData.get("type") as string;
  const description = formData.get("description") as string;
  const tenantId = (formData.get("tenantId") as string) || null;
  const assigneeId = (formData.get("assigneeId") as string) || null;
  const dueDate = (formData.get("dueDate") as string) || null;
  if (!type || !description) return;
  await db.insert(actions).values({
    id: randomUUID(),
    type: type as ActionType,
    description,
    tenantId,
    assigneeId: assigneeId || null,
    status: "未着手",
    dueDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  redirect("/actions");
}

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ editAction?: string }>;
}) {
  const { editAction } = await searchParams;

  const [actionRows, tenantList, userList] = await Promise.all([
    db
      .select({
        id: actions.id,
        type: actions.type,
        description: actions.description,
        status: actions.status,
        dueDate: actions.dueDate,
        resolvedAt: actions.resolvedAt,
        createdAt: actions.createdAt,
        tenantId: actions.tenantId,
        assigneeId: actions.assigneeId,
        companyName: tenants.companyName,
        assigneeName: users.name,
      })
      .from(actions)
      .leftJoin(tenants, eq(actions.tenantId, tenants.id))
      .leftJoin(users, eq(actions.assigneeId, users.id))
      .orderBy(desc(actions.createdAt)),
    db.select({ id: tenants.id, companyName: tenants.companyName }).from(tenants).orderBy(tenants.companyName),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">アクション管理</h1>
        <p className="text-sm text-gray-500 mt-1">{actionRows.length}件</p>
      </div>

      {/* New Action Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            新規アクション登録
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAction} className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="type">種別 *</Label>
              <select
                id="type"
                name="type"
                required
                className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>取引先</Label>
              <TenantCombobox tenants={tenantList} name="tenantId" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="description">説明 *</Label>
              <Input id="description" name="description" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="assigneeId">アクション実行者</Label>
              <select
                id="assigneeId"
                name="assigneeId"
                className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">未設定</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dueDate">期限</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
            <div className="col-span-2">
              <Button type="submit">登録する</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Actions List */}
      <Card>
        <CardContent className="p-4">
          <ActionsTable
            rows={actionRows}
            tenantList={tenantList}
            userList={userList}
            editAction={editAction}
            updateActionStatus={updateActionStatus}
            updateAction={updateAction}
            deleteAction={deleteAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
