import "server-only";

/**
 * Slack Incoming Webhook への投稿。
 *
 * 絶対に throw しない。src/lib/audit.ts の logActivity と同じ方針で、
 * 通知の失敗でメイン処理（同期・承認・取込）を止めない。
 * Slack障害のせいで請求データの取込が落ちる、という事態を作らないため。
 *
 * SLACK_WEBHOOK_URL が未設定なら何もしない（ローカル開発でノイズを出さない）。
 */
export async function postSlack(text: string): Promise<"sent" | "failed" | "skipped"> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return "skipped";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("Slack post failed:", res.status, await res.text().catch(() => ""));
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("Slack post error:", e);
    return "failed";
  }
}
