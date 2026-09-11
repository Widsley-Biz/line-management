import "server-only";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { postSlack } from "@/lib/slack";

/**
 * アプリ内お知らせと Slack 投稿を1つの関数にまとめる。
 *
 * 別々に呼ぶ作りにすると必ず片方を呼び忘れる。呼び口はここだけにする。
 * slackStatus を残すので「Slackに飛ばなかった」ことも後から分かる。
 *
 * logActivity と同じく、失敗してもメイン処理は止めない。
 */
export async function notify(params: {
  level?: "info" | "warn" | "error";
  /** concierge_sync | concierge_diff | import など */
  category: string;
  title: string;
  body?: string;
  /** 画面から飛べるリンク（例 /mobile/concierge） */
  linkUrl?: string;
  refTable?: string;
  refId?: string;
  /** 既定では info 以外をSlackに流す */
  slack?: boolean;
}): Promise<void> {
  const level = params.level ?? "info";
  const toSlack = params.slack ?? level !== "info";

  try {
    let slackStatus: "sent" | "failed" | "skipped" = "skipped";
    if (toSlack) {
      const icon = level === "error" ? ":x:" : level === "warn" ? ":warning:" : ":information_source:";
      const lines = [`${icon} *${params.title}*`];
      if (params.body) lines.push(params.body);
      if (params.linkUrl) {
        const base = process.env.APP_BASE_URL ?? "";
        lines.push(base ? `${base}${params.linkUrl}` : params.linkUrl);
      }
      slackStatus = await postSlack(lines.join("\n"));
    }

    await db.insert(notifications).values({
      id: randomUUID(),
      level,
      category: params.category,
      title: params.title,
      body: params.body ?? null,
      linkUrl: params.linkUrl ?? null,
      refTable: params.refTable ?? null,
      refId: params.refId ?? null,
      slackStatus,
      // 監査ログと揃えて日本時間で保存する
      createdAt: new Date(Date.now() + 9 * 60 * 60 * 1000)
        .toISOString()
        .replace("Z", "+09:00"),
    });
  } catch (e) {
    console.error("notify error:", e);
  }
}
