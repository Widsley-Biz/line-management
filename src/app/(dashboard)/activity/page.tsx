import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { ActivityTable } from "@/components/activity-table";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10));
  const limit = 50;
  const offset = (pageNum - 1) * limit;

  const rows = await db
    .select({
      id: auditLogs.id,
      actionType: auditLogs.actionType,
      message: auditLogs.message,
      targetTable: auditLogs.targetTable,
      createdAt: auditLogs.createdAt,
      userName: users.name,
      beforeJson: auditLogs.beforeJson,
      afterJson: auditLogs.afterJson,  
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">更新履歴</h1>
        <p className="text-sm text-gray-500 mt-1">システム上の操作履歴</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <ActivityTable rows={rows} />
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex justify-between text-sm">
        {pageNum > 1 ? (
          <a href={`/activity?page=${pageNum - 1}`} className="text-blue-600 hover:underline">← 前のページ</a>
        ) : <span />}
        {rows.length === limit && (
          <a href={`/activity?page=${pageNum + 1}`} className="text-blue-600 hover:underline">次のページ →</a>
        )}
      </div>
    </div>
  );
}
