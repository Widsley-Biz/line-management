export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * fetch のレスポンスを安全にJSONとして読む。
 *
 * 重い取込でCloud Runのリクエストタイムアウトに達すると、JSONではなく
 * `upstream request timeout` というテキストやHTMLのエラーページが返る。
 * そのまま res.json() すると「Unexpected token 'u'」のような原因の分からない
 * 例外になるため、状況を説明する日本語メッセージに変換する。
 */
export async function readJson<T>(res: Response): Promise<JsonResult<T>> {
  const text = await res.text();

  let parsed: unknown = null;
  let isJson = false;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  if (!isJson) {
    return { ok: false, error: describeNonJsonResponse(res.status, text) };
  }
  if (!res.ok) {
    const message = (parsed as { error?: string } | null)?.error;
    return {
      ok: false,
      error: message ?? `サーバーエラーが発生しました（HTTP ${res.status}）`,
    };
  }
  return { ok: true, data: parsed as T };
}

function describeNonJsonResponse(status: number, body: string): string {
  const head = body.slice(0, 200);
  if (!head.trim()) {
    return [
      `サーバーでエラーが発生しました（HTTP ${status}）。`,
      "操作は反映されていない可能性があります。画面を再読み込みして結果を確認してください。",
    ].join("");
  }
  if (status === 504 || /upstream request timeout/i.test(head)) {
    return [
      "処理に時間がかかり、接続がタイムアウトしました。",
      "サーバー側では処理が続いている場合があります。",
      "1〜2分待ってから画面を再読み込みして結果を確認してください。",
      "同じ操作を繰り返すと二重に登録される可能性があります。",
    ].join("");
  }
  if (status === 502 || status === 503) {
    return [
      "サーバーが一時的に応答できませんでした（他の重い処理の実行中と思われます）。",
      "1〜2分待ってから画面を再読み込みして結果を確認してください。",
    ].join("");
  }
  return [
    `想定外の応答が返りました（HTTP ${status}）。`,
    "画面を再読み込みして結果を確認してください。",
  ].join("");
}
