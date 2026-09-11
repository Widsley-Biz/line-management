import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { count, desc } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatJstDateTime } from "@/lib/format";

const PAGE_SIZE = 50;

const LEVEL_LABELS: Record<string, string> = {
  info: "お知らせ",
  warn: "注意",
  error: "エラー",
};

const SLACK_LABELS: Record<string, string> = {
  sent: "Slack送信済",
  failed: "Slack送信失敗",
  skipped: "Slack未送信",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(notifications),
  ]);
  const total = totalRow[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">お知らせ</h1>
        <p className="text-sm text-gray-500 mt-1">
          同期の結果や、対応が必要な事象の記録です。
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="p-2 text-left w-24">区分</th>
                <th className="p-2 text-left">内容</th>
                <th className="p-2 text-left w-36">日時</th>
                <th className="p-2 text-left w-28">Slack</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    お知らせはありません
                  </td>
                </tr>
              )}
              {rows.map((n) => (
                <tr key={n.id} className="border-b hover:bg-gray-50 align-top">
                  <td className="p-2">
                    <Badge
                      variant={
                        n.level === "error"
                          ? "destructive"
                          : n.level === "warn"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {LEVEL_LABELS[n.level] ?? n.level}
                    </Badge>
                  </td>
                  <td className="p-2">
                    <div className="font-medium">
                      {n.linkUrl ? (
                        <Link href={n.linkUrl} className="text-blue-600 hover:underline">
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </div>
                    {n.body && (
                      <div className="text-gray-600 whitespace-pre-wrap mt-0.5">
                        {n.body}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-gray-500 whitespace-nowrap">
                    {formatJstDateTime(n.createdAt)}
                  </td>
                  <td className="p-2 text-xs text-gray-500">
                    {SLACK_LABELS[n.slackStatus] ?? n.slackStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/notifications?page=${page - 1}`} className="text-blue-600 hover:underline">
              前へ
            </Link>
          )}
          <span className="text-gray-600">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/notifications?page=${page + 1}`} className="text-blue-600 hover:underline">
              次へ
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
