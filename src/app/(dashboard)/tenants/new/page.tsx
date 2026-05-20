import { db } from "@/lib/db";
import { tenants, users } from "@/lib/db/schema";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

async function createTenant(formData: FormData) {
  "use server";
  const companyName = formData.get("companyName") as string;
  const sfOpportunityId = (formData.get("sfOpportunityId") as string) || null;
  const mfPartnerId = (formData.get("mfPartnerId") as string) || null;
  const assigneeId = (formData.get("assigneeId") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  if (!companyName || !sfOpportunityId) {
    throw new Error("必須項目を入力してください");
  }

  // slugはSF商談IDを自動使用
  const slug = sfOpportunityId;

  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(tenants).values({
    id,
    slug,
    companyName,
    sfOpportunityId,
    mfPartnerId,
    assigneeId: assigneeId || null,
    status: "active",
    notes,
    createdAt: now,
    updatedAt: now,
  });

  redirect(`/tenants/${id}`);
}

export default async function NewTenantPage() {
  const userList = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .orderBy(users.name);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/tenants" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">テナント新規登録</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>テナント情報</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTenant} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="companyName">会社名 *</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  placeholder="株式会社サンプル"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sfOpportunityId">SF商談ID *</Label>
                <Input
                  id="sfOpportunityId"
                  name="sfOpportunityId"
                  placeholder="006Q900001aE5U2IAK"
                  required
                />
                <p className="text-xs text-gray-400">SF上のCaseSafeID</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="mfPartnerId">MFパートナーID</Label>
                <Input id="mfPartnerId" name="mfPartnerId" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="assigneeId">担当者</Label>
                <select
                  id="assigneeId"
                  name="assigneeId"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">未設定</option>
                  {userList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">備考</Label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit">登録する</Button>
              <Link
                href="/tenants"
                className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-input bg-background text-sm font-medium hover:bg-muted"
              >
                キャンセル
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}