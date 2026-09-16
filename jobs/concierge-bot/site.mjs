/**
 * ===========================================================================
 *  ここがサイト依存の唯一の場所。codegen の録画をもとに書き換える。
 * ===========================================================================
 *
 * Playwright codegen の出し方:
 *   npx playwright codegen <コンシェルのログインURL>
 *
 * 録画した操作のうち、
 *   1) ログイン           → login() に
 *   2) 回線一覧まで行く   → gotoLineList() に
 *   3) 表の読み取り／次へ → readPage() / gotoNextPage() に
 * それぞれ写す。
 *
 * この4つの関数の「約束」だけ守れば、呼び出し側（index.mjs）は
 * いっさい変更しなくてよい。
 */

/** 列見出しの表記ゆれを吸収する。左が内部名、右が画面に出る文字列の候補 */
export const COLUMN_ALIASES = {
  phoneNumber: ["電話番号", "携帯番号", "ご利用番号", "回線番号"],
  contactName: ["氏名", "利用者", "契約者", "お名前", "ご利用者", "名前"],
  imei: ["製造番号", "IMEI"],
  iccid: ["ICCID", "SIM番号"],
  deptCode: ["部署コード"],
  deptName: ["部署名"],
  planName: ["料金プラン", "プラン"],
  lineStatus: ["状態", "回線状態", "ステータス"],
};

/**
 * ログインする。
 * 失敗したら throw すること（呼び出し側が失敗として記録する）。
 */
export async function login(page, { loginUrl, id, password }) {
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  // TODO(codegen): 実サイトのロケーターに差し替える
  // いまはモックサイト（/mock-concierge/login）に合わせてある
  await page.locator('input[name="id"]').fill(id);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /ログイン/ }).click();

  await page.waitForLoadState("networkidle");

  // ログイン失敗をここで確実に落とす。
  // 失敗に気づかず空の一覧を取ると、全回線が解約扱いになる。
  const stillOnLogin = await page
    .getByRole("button", { name: /ログイン/ })
    .isVisible()
    .catch(() => false);
  if (stillOnLogin) {
    throw new Error("ログインに失敗しました（ログイン画面のままです）");
  }
}

/** 回線一覧のページまで移動する */
export async function gotoLineList(page) {
  // TODO(codegen): 実サイトの導線に差し替える
  // モックはログイン後そのまま一覧に着くので、ここでは何もしない
  await page.waitForLoadState("networkidle");
}

/**
 * いま表示されているページの表を読み取って
 * [{ 見出し: 値, ... }, ...] の配列で返す。
 *
 * 見出しはサイトの表記のまま返してよい（内部名への変換は index.mjs 側）。
 */
export async function readPage(page) {
  // TODO(codegen): テーブルのセレクタを実際のものに差し替える
  return await page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return [];

    const headers = [...table.querySelectorAll("thead th")].map((th) =>
      (th.textContent ?? "").trim()
    );
    if (headers.length === 0) return [];

    return [...table.querySelectorAll("tbody tr")]
      .map((tr) => {
        const cells = [...tr.querySelectorAll("td")].map((td) =>
          (td.textContent ?? "").replace(/\s+/g, " ").trim()
        );
        if (cells.length === 0) return null;
        const row = {};
        headers.forEach((h, i) => {
          if (h) row[h] = cells[i] ?? "";
        });
        return row;
      })
      .filter(Boolean);
  });
}

/**
 * 次のページへ進む。進めたら true、最終ページなら false を返す。
 * ページ送りが無いサイトなら常に false を返すだけでよい。
 */
export async function gotoNextPage(page) {
  // TODO(codegen): ページ送りの実装に差し替える
  // TODO(codegen): 実サイトのページ送りに差し替える
  const next = page.getByRole("link", { name: /次へ|次のページ|›/ });
  const count = await next.count().catch(() => 0);
  if (count === 0) return false;

  const disabled = await next
    .first()
    .getAttribute("aria-disabled")
    .catch(() => null);
  if (disabled === "true") return false;

  await next.first().click();
  await page.waitForLoadState("networkidle");
  return true;
}
