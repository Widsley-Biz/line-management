/**
 * ===========================================================================
 *  サイト依存の処理はこのファイルだけ。サイトが変わったらここを直す。
 * ===========================================================================
 *
 * 対象: SB法人コンシェルサイト
 *   ログイン      https://portal.business.mb.softbank.jp/portal/BPS0001/index
 *   回線情報の照会 https://portal.business.mb.softbank.jp/portal/admin/line/BPS0201/index
 *
 * 2026-09-25 に実画面（株式会社Widsley / 請求先番号 8789213799 / 28回線）で
 * 構造を確認して実装した。確認した内容は docs/PHASE_C_NEXT.md に控えてある。
 *
 * 録画し直したいとき:
 *   npx playwright codegen https://portal.business.mb.softbank.jp/portal/BPS0001/index
 */

/** 一覧ページのURL。ログイン後はここへ直接飛べる */
const LINE_LIST_URL =
  "https://portal.business.mb.softbank.jp/portal/admin/line/BPS0201/index";

/**
 * 内部名 → このサイトの列名の対応。
 *
 * このサイトは各 th に `<div class="column_name">` で内部フィールド名を持っている
 * （例 equipmentSerialNbr / newestImei / personNm）。日本語ラベルより表記ゆれに
 * 強いので、そちらを第一候補にする。2番目以降は画面改修でフィールド名が変わった
 * ときの保険。
 */
export const COLUMN_ALIASES = {
  phoneNumber: ["msn", "電話番号", "携帯番号", "ご利用番号"],
  contactName: ["personNm", "氏名", "利用者", "契約者"],
  imei: ["newestImei", "製造番号", "IMEI"],
  iccid: ["equipmentSerialNbr", "ICCID"],
  deptCode: ["deptCd1", "部署コード"],
  deptName: ["deptNm1", "部署名"],
  planName: ["modelNm", "機種名"],
  lineStatus: ["status", "ステータス", "回線状態"],
};

export async function login(page, { loginUrl, id, password }) {
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  // form[name="BPS0101ActionForm"] → POST /portal/BPS0101/login;jsessionid=...
  // 「ログイン」は <button> ではなく <a href="javascript:void(0)">
  await page.locator('input[name="authId"]').fill(id);
  await page.locator('input[name="pwd"]').fill(password);
  await page.getByRole("link", { name: "ログイン", exact: true }).click();

  await page.waitForLoadState("networkidle");

  // ログイン失敗をここで確実に落とす。
  // 失敗に気づかず空の一覧を取ると、全回線が解約扱いになる。
  const stillOnLogin = await page
    .locator('input[name="authId"]')
    .isVisible()
    .catch(() => false);
  if (stillOnLogin) {
    const msg = await page
      .locator(".error, .errorMessage, [class*=error]")
      .first()
      .innerText()
      .catch(() => "");
    throw new Error(
      `ログインに失敗しました（ログイン画面のままです）${msg ? `: ${msg.trim().slice(0, 200)}` : ""}`
    );
  }
}

/** 回線情報の照会ページへ行き、1ページあたりの表示件数を最大にする */
export async function gotoLineList(page) {
  await page.goto(LINE_LIST_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".body_left_content_wrapper table.tableControl", {
    timeout: 30000,
  });

  // 200件表示にしてページ送りの回数を減らす（選択肢は 50 / 100 / 200）
  const sel = page.locator('select[name="tableControlDto.pageViewCount"]');
  if ((await sel.count()) > 0) {
    const current = await sel.inputValue().catch(() => "");
    if (current !== "200") {
      await sel.selectOption("200").catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});
      await page
        .waitForSelector(".body_left_content_wrapper table.tableControl", { timeout: 30000 })
        .catch(() => {});
    }
  }
}

/**
 * 表示中のページを読み取って [{列名: 値}, ...] を返す。
 *
 * この一覧は列が固定列と横スクロール列の「2つの表」に分かれている。
 *   左（固定）  .body_left_content_wrapper table.tableControl … 選択/No./ステータス/グループ名/電話番号
 *   右（可動）  .ui-flickable-content     table.tableControl … SIM種別/ICCID/PUK/機種契約番号/IMEI/機種名/氏名/部署名/各種サービス
 * 見出しもそれぞれ別の表にあるので、行番号で突き合わせて1行にまとめる。
 */
export async function readPage(page) {
  return await page.evaluate(() => {
    // 見出し行から内部フィールド名を順に拾う。
    // 「利用可能サービス」のようなグループ見出しは名前を持たないため、
    // colspan の分だけ null で埋めてデータ列との位置ずれを防ぐ。
    const headerNames = (tableSel) => {
      const t = document.querySelector(tableSel);
      if (!t) return [];
      const firstRow = [...t.querySelectorAll("tr")].find(
        (tr) => tr.querySelectorAll("th").length > 0
      );
      if (!firstRow) return [];
      const out = [];
      for (const th of firstRow.querySelectorAll("th")) {
        const name = th.querySelector("div.column_name")?.textContent.trim() || null;
        const span = parseInt(th.getAttribute("colspan") || "1", 10);
        out.push(name);
        for (let i = 1; i < span; i++) out.push(null);
      }
      return out;
    };

    const bodyRows = (tableSel) => {
      const t = document.querySelector(tableSel);
      if (!t) return [];
      return [...t.querySelectorAll("tbody tr")].map((tr) =>
        [...tr.querySelectorAll("td")].map((td) =>
          (td.textContent || "").replace(/\s+/g, " ").trim()
        )
      );
    };

    const lName = headerNames(".header_left table");
    const rName = headerNames(".header_right_content_wrapper table");
    const lBody = bodyRows(".body_left_content_wrapper table.tableControl");
    const rBody = bodyRows(".ui-flickable-content table.tableControl");

    // 左右で行数が違うのは読み取り位置がずれている証拠。
    // そのまま返すと別回線のICCIDを紐付けてしまうので必ず止める。
    if (lBody.length !== rBody.length) {
      throw new Error(
        `一覧の左右で行数が一致しません（左${lBody.length}件 / 右${rBody.length}件）。画面構造が変わった可能性があります`
      );
    }

    return lBody.map((leftCells, i) => {
      const row = {};
      lName.forEach((n, j) => {
        if (n) row[n] = leftCells[j] ?? "";
      });
      rName.forEach((n, j) => {
        if (n) row[n] = rBody[i][j] ?? "";
      });
      return row;
    });
  });
}

/**
 * 次のページへ進む。進めたら true、最終ページなら false。
 *
 * ページ番号は hidden の `tableControlDto.pageNum` が持っている。
 * 28回線（1ページに収まる）でしか実機確認できていないため、複数ページある
 * アカウントで動かすときは最初に必ず件数の突き合わせをすること。
 */
export async function gotoNextPage(page) {
  const next = page.locator(
    'a:has-text("次へ"), a:has-text("次の"), a[title*="次"]'
  );
  const count = await next.count().catch(() => 0);
  if (count === 0) return false;

  const first = next.first();
  if (!(await first.isVisible().catch(() => false))) return false;

  const disabled = await first.getAttribute("aria-disabled").catch(() => null);
  if (disabled === "true") return false;

  await first.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .waitForSelector(".body_left_content_wrapper table.tableControl", { timeout: 30000 })
    .catch(() => {});
  return true;
}
