import { Fragment } from "react";
import { db } from "@/lib/db";
import { users, packs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatYen } from "@/lib/format";
import { Settings, Users, Package } from "lucide-react";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

// ── User actions ─────────────────────────────────────────────

async function createUser(formData: FormData) {
  "use server";
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;
  if (!name || !email || !password) return;
  const passwordHash = await bcrypt.hash(password, 12);
  const id = randomUUID();
  await db.insert(users).values({
    id, name, email, passwordHash,
    role: role as "admin" | "leader" | "member" | "viewer",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const session = await auth();
  await logActivity({
    userId: session?.user?.id,
    actionType: "user_create",
    message: `ユーザーを追加しました: ${name} (${email})`,
    targetTable: "users",
    targetId: id,
  });
  redirect("/settings");
}

async function updateUser(formData: FormData) {
  "use server";
  const id = formData.get("userId") as string;
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const role = formData.get("role") as string;
  const newPassword = (formData.get("newPassword") as string) || null;
  if (!id || !name || !email) return;
  const updates: Record<string, string> = {
    name, email,
    role: role as "admin" | "leader" | "member" | "viewer",
    updatedAt: new Date().toISOString(),
  };
  if (newPassword) {
    updates.passwordHash = await bcrypt.hash(newPassword, 12);
  }
  await db.update(users).set(updates).where(eq(users.id, id));
  const session = await auth();
  await logActivity({
    userId: session?.user?.id,
    actionType: "user_update",
    message: `ユーザーを更新しました: ${name}`,
    targetTable: "users",
    targetId: id,
  });
  redirect("/settings");
}

async function updateSfUserId(formData: FormData) {
  "use server";
  const id = formData.get("userId") as string;
  const sfUserId = (formData.get("sfUserId") as string)?.trim() || null;
  if (!id) return;
  await db.update(users).set({
    sfUserId,
    updatedAt: new Date().toISOString(),
  }).where(eq(users.id, id));
  const session = await auth();
  await logActivity({
    userId: session?.user?.id,
    actionType: "sf_mapping",
    message: sfUserId
      ? `SF UserID を手動設定: ${sfUserId}`
      : `SF UserID を解除`,
    targetTable: "users",
    targetId: id,
  });
  redirect("/settings");
}

async function deleteUser(formData: FormData) {
  "use server";
  const id = formData.get("userId") as string;
  const name = formData.get("userName") as string;
  if (!id) return;
  await db.delete(users).where(eq(users.id, id));
  const session = await auth();
  await logActivity({
    userId: session?.user?.id,
    actionType: "user_delete",
    message: `ユーザーを削除しました: ${name}`,
    targetTable: "users",
    targetId: id,
  });
  redirect("/settings");
}

// ── Pack actions ──────────────────────────────────────────────

async function createPack(formData: FormData) {
  "use server";
  const name = formData.get("name") as string;
  const sfProductCode = formData.get("sfProductCode") as string;
  const price = parseInt(formData.get("price") as string, 10) || 0;
  const credit = parseInt(formData.get("credit") as string, 10) || 0;
  const bonusRate = parseFloat(formData.get("bonusRate") as string) / 100 || 0;
  if (!name || !sfProductCode) return;
  const id = randomUUID();
  const maxSort = await db.select({ s: packs.sortOrder }).from(packs).orderBy(packs.sortOrder);
  const sortOrder = (maxSort.at(-1)?.s ?? 0) + 1;
  await db.insert(packs).values({ id, name, sfProductCode, price, credit, bonusRate, isActive: true, sortOrder });
  const session = await auth();
  await logActivity({
    userId: session?.user?.id,
    actionType: "pack_create",
    message: `パックを追加しました: ${name}`,
    targetTable: "packs",
    targetId: id,
  });
  redirect("/settings");
}

async function updatePack(formData: FormData) {
  "use server";
  const id = formData.get("packId") as string;
  const name = formData.get("name") as string;
  const price = parseInt(formData.get("price") as string, 10) || 0;
  const credit = parseInt(formData.get("credit") as string, 10) || 0;
  const bonusRate = parseFloat(formData.get("bonusRate") as string) / 100 || 0;
  if (!id || !name) return;
  await db.update(packs).set({ name, price, credit, bonusRate }).where(eq(packs.id, id));
  const session = await auth();
  await logActivity({
    userId: session?.user?.id,
    actionType: "pack_update",
    message: `パックを更新しました: ${name}`,
    targetTable: "packs",
    targetId: id,
  });
  redirect("/settings");
}

async function togglePackActive(formData: FormData) {
  "use server";
  const id = formData.get("packId") as string;
  const currentActive = formData.get("currentActive") === "true";
  const name = formData.get("packName") as string;
  if (!id) return;
  await db.update(packs).set({ isActive: !currentActive }).where(eq(packs.id, id));
  const session = await auth();
  await logActivity({
    userId: session?.user?.id,
    actionType: currentActive ? "pack_disable" : "pack_update",
    message: `パックを${currentActive ? "無効化" : "有効化"}しました: ${name}`,
    targetTable: "packs",
    targetId: id,
  });
  redirect("/settings");
}

// ── Page ──────────────────────────────────────────────────────

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ editUser?: string; editPack?: string; sfError?: string; sfSuccess?: string }>;
}) {
  const { editUser, editPack, sfError, sfSuccess: _sfSuccess } = await searchParams;

  const [userList, packList] = await Promise.all([
    db.select().from(users).orderBy(users.name),
    db.select().from(packs).orderBy(packs.sortOrder),
  ]);

  const currentSession = await auth();
  const editingUser = editUser ? userList.find((u) => u.id === editUser) : null;
  const editingPack = editPack ? packList.find((p) => p.id === editPack) : null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="text-sm text-gray-500 mt-1">システム設定・マスタ管理</p>
      </div>

      {/* SF連携通知 */}
      {sfError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          SF連携エラー: {decodeURIComponent(sfError)}
        </div>
      )}
      {_sfSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          SF連携が完了しました
        </div>
      )}

      {/* ── Users ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            ユーザー管理
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-3 py-2 font-medium text-gray-600">名前</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">メール</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">ロール</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">SF連携</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {userList.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">{u.name}</td>
                    <td className="px-3 py-2 text-gray-600">{u.email}</td>
                    <td className="px-3 py-2">
                      <Badge variant={u.role === "admin" ? "default" : "outline"}>{u.role}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {u.sfRefreshToken ? (
                        <Badge variant="default" className="text-xs">連携済</Badge>
                      ) : u.sfUserId ? (
                        <Badge variant="outline" className="text-xs">ID手動設定</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">未連携</Badge>
                      )}
                      {u.sfUserId && (
                        <span className="block text-[10px] text-gray-400 font-mono mt-0.5">{u.sfUserId}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {u.id === currentSession?.user?.id && !u.sfRefreshToken && (
                          <a
                            href="/api/auth/sf/connect"
                            className="text-xs px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700"
                          >
                            SF連携
                          </a>
                        )}
                        <a
                          href={`/settings?editUser=${u.id}`}
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                        >
                          編集
                        </a>
                        <form action={deleteUser}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="userName" value={u.name} />
                          <ConfirmDeleteButton
                            message={`${u.name} を削除しますか？`}
                            className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700"
                          >
                            削除
                          </ConfirmDeleteButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                  {/* Inline edit form */}
                  {editingUser?.id === u.id && (
                    <tr className="bg-blue-50 border-b">
                      <td colSpan={5} className="px-3 py-4">
                        <p className="text-xs font-medium text-blue-700 mb-3">ユーザー編集</p>
                        <form action={updateUser} className="grid grid-cols-2 gap-3">
                          <input type="hidden" name="userId" value={u.id} />
                          <div className="space-y-1">
                            <Label className="text-xs">名前 *</Label>
                            <Input name="name" defaultValue={u.name} required className="h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">メール *</Label>
                            <Input name="email" type="email" defaultValue={u.email} required className="h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">新しいパスワード（変更する場合のみ）</Label>
                            <Input name="newPassword" type="password" placeholder="未入力で変更なし" className="h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">ロール</Label>
                            <select
                              name="role"
                              defaultValue={u.role}
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                            >
                              <option value="member">member</option>
                              <option value="leader">leader</option>
                              <option value="admin">admin</option>
                              <option value="viewer">viewer</option>
                            </select>
                          </div>
                          <div className="col-span-2 flex gap-2">
                            <Button type="submit" size="sm">保存</Button>
                            <a href="/settings" className="inline-flex items-center h-8 px-3 rounded-md text-sm text-gray-600 hover:bg-gray-100">
                              キャンセル
                            </a>
                          </div>
                        </form>
                        {currentSession?.user?.role === "admin" && (
                          <div className="border-t mt-3 pt-3">
                            <p className="text-xs font-medium text-gray-500 mb-2">SF UserID 手動設定（管理者用）</p>
                            <form action={updateSfUserId} className="flex gap-2 items-end">
                              <input type="hidden" name="userId" value={u.id} />
                              <div className="flex-1 space-y-1">
                                <Label className="text-xs">SF User ID (18桁)</Label>
                                <Input
                                  name="sfUserId"
                                  defaultValue={u.sfUserId ?? ""}
                                  placeholder="005xxxxxxxxxxxxxxx"
                                  className="h-8 text-sm font-mono"
                                />
                              </div>
                              <Button type="submit" size="sm" variant="outline">設定</Button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">ユーザー追加</p>
            <form action={createUser} className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name">名前 *</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">メール *</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">パスワード *</Label>
                <Input id="password" name="password" type="password" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="role">ロール</Label>
                <select
                  id="role"
                  name="role"
                  className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="member">member</option>
                  <option value="leader">leader</option>
                  <option value="admin">admin</option>
                  <option value="viewer">viewer</option>
                </select>
              </div>
              <div className="col-span-2">
                <Button type="submit" size="sm">追加する</Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* ── Packs ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            パックマスタ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">パック名</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">SFコード</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">価格</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">クレジット</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ボーナス率</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">状態</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {packList.map((p) => (
                <Fragment key={p.id}>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.sfProductCode}</td>
                    <td className="px-4 py-3 text-right">{formatYen(p.price)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatYen(p.credit)}</td>
                    <td className="px-4 py-3 text-right">{(p.bonusRate * 100).toFixed(0)}%</td>
                    <td className="px-4 py-3">
                      <Badge variant={p.isActive ? "default" : "secondary"}>
                        {p.isActive ? "有効" : "無効"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <a
                          href={`/settings?editPack=${p.id}`}
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                        >
                          編集
                        </a>
                        <form action={togglePackActive}>
                          <input type="hidden" name="packId" value={p.id} />
                          <input type="hidden" name="currentActive" value={String(p.isActive)} />
                          <input type="hidden" name="packName" value={p.name} />
                          <button
                            type="submit"
                            className={`text-xs px-2 py-1 rounded ${
                              p.isActive
                                ? "bg-amber-50 hover:bg-amber-100 text-amber-700"
                                : "bg-green-50 hover:bg-green-100 text-green-700"
                            }`}
                          >
                            {p.isActive ? "無効化" : "有効化"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                  {/* Inline edit form */}
                  {editingPack?.id === p.id && (
                    <tr className="bg-blue-50 border-b">
                      <td colSpan={7} className="px-4 py-4">
                        <p className="text-xs font-medium text-blue-700 mb-3">パック編集</p>
                        <form action={updatePack} className="grid grid-cols-4 gap-3 items-end">
                          <input type="hidden" name="packId" value={p.id} />
                          <div className="space-y-1">
                            <Label className="text-xs">パック名 *</Label>
                            <Input name="name" defaultValue={p.name} required className="h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">価格 (円)</Label>
                            <Input name="price" type="number" defaultValue={p.price} className="h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">クレジット (円)</Label>
                            <Input name="credit" type="number" defaultValue={p.credit} className="h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">ボーナス率 (%)</Label>
                            <Input name="bonusRate" type="number" step="0.1" defaultValue={(p.bonusRate * 100).toFixed(1)} className="h-8 text-sm" />
                          </div>
                          <div className="col-span-4 flex gap-2">
                            <Button type="submit" size="sm">保存</Button>
                            <a href="/settings" className="inline-flex items-center h-8 px-3 rounded-md text-sm text-gray-600 hover:bg-gray-100">
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

          {/* Add pack form */}
          <div className="border-t px-4 pt-4 pb-4">
            <p className="text-sm font-medium mb-3">パック追加</p>
            <form action={createPack} className="grid grid-cols-4 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">パック名 *</Label>
                <Input name="name" placeholder="IP Pack 20000" required className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SFプロダクトコード *</Label>
                <Input name="sfProductCode" placeholder="IP_Pack20000" required className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">価格 (円)</Label>
                <Input name="price" type="number" defaultValue="0" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">クレジット (円)</Label>
                <Input name="credit" type="number" defaultValue="0" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ボーナス率 (%)</Label>
                <Input name="bonusRate" type="number" step="0.1" defaultValue="0" className="h-8 text-sm" />
              </div>
              <div>
                <Button type="submit" size="sm">追加する</Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* SF Connection Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Salesforce接続設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">SF_LOGIN_URL</span>
              <span className="font-mono text-xs">{process.env.SF_LOGIN_URL ?? "未設定"}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">SF_USERNAME</span>
              <span className="font-mono text-xs">{process.env.SF_USERNAME ? "設定済み" : "未設定"}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">SF_PASSWORD</span>
              <span className="font-mono text-xs">{process.env.SF_PASSWORD ? "設定済み" : "未設定"}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">SF_PRODUCT2_ID_CC01</span>
              <span className="font-mono text-xs">{process.env.SF_PRODUCT2_ID_CC01 ?? "未設定"}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-600">SF_PRODUCT2_ID_CC02</span>
              <span className="font-mono text-xs">{process.env.SF_PRODUCT2_ID_CC02 ?? "未設定"}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">.envファイルまたは環境変数で設定してください</p>
        </CardContent>
      </Card>
    </div>
  );
}
