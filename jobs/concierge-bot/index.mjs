/**
 * concierge-bot — SB法人コンシェルから全回線を取得して本体に渡す Cloud Run Job。
 *
 * 設計上の約束（docs/CONCIERGE_SYNC.md）:
 *   INV-1 このプロセスはDBに一切触らない。結果はHTTPで本体に返す
 *
 * 環境変数:
 *   RUN_ID / CALLBACK_TOKEN / CALLBACK_URL  … 本体が Job 起動時に渡す
 *   SB_CONCIERGE_LOGIN_URL / SB_CONCIERGE_ID / SB_CONCIERGE_PASSWORD
 *   MAX_PAGES  … ページ送りの安全弁（既定200）
 *   HEADLESS   … "0" でブラウザを表示（ローカル確認用）
 */
import { chromium } from "playwright";
import {
  COLUMN_ALIASES,
  login,
  gotoLineList,
  readPage,
  gotoNextPage,
} from "./site.mjs";

const {
  RUN_ID,
  CALLBACK_TOKEN,
  CALLBACK_URL,
  SB_CONCIERGE_LOGIN_URL,
  SB_CONCIERGE_ID,
  SB_CONCIERGE_PASSWORD,
  MAX_PAGES = "200",
  HEADLESS = "1",
} = process.env;

const log = [];
function step(level, stepName, message) {
  const entry = { at: new Date().toISOString(), step: stepName, level, message };
  log.push(entry);
  console.log(`[${level}] ${stepName}: ${message}`);
}

/**
 * 画面の見出し → 内部名 の対応表を作る。
 *
 * 完全一致を先に試す。部分一致だけにすると、例えば内部名 `msnCtrlFlg`
 * （ケータイ機能制御）が電話番号の候補 `msn` に誤って当たる。
 */
function buildColumnMap(headers) {
  const norm = (v) => v.replace(/\s+/g, "");
  const map = {};
  for (const [internal, candidates] of Object.entries(COLUMN_ALIASES)) {
    let hit = null;
    for (const c of candidates) {
      hit = headers.find((h) => norm(h) === norm(c));
      if (hit) break;
    }
    if (!hit) {
      for (const c of candidates) {
        hit = headers.find((h) => norm(h).includes(norm(c)));
        if (hit) break;
      }
    }
    if (hit) map[internal] = hit;
  }
  return map;
}

/** サイトの表記のままの行を、本体が受け取れる形に詰め替える */
function toRow(raw, colMap) {
  const pick = (key) => (colMap[key] ? raw[colMap[key]] ?? null : null);
  return {
    phoneNumber: pick("phoneNumber"),
    contactName: pick("contactName"),
    imei: pick("imei"),
    iccid: pick("iccid"),
    deptCode: pick("deptCode"),
    deptName: pick("deptName"),
    planName: pick("planName"),
    lineStatus: pick("lineStatus"),
    raw,
  };
}

async function report(payload) {
  if (!CALLBACK_URL) {
    console.log("CALLBACK_URL 未設定のため送信をスキップします");
    console.log(JSON.stringify(payload, null, 2).slice(0, 2000));
    return;
  }
  const res = await fetch(CALLBACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId: RUN_ID,
      callbackToken: CALLBACK_TOKEN,
      ...payload,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`本体への送信に失敗しました (HTTP ${res.status}): ${text}`);
  }
  console.log(`本体へ送信しました: ${text}`);
}

async function main() {
  if (!SB_CONCIERGE_LOGIN_URL || !SB_CONCIERGE_ID || !SB_CONCIERGE_PASSWORD) {
    throw new Error(
      "SB_CONCIERGE_LOGIN_URL / SB_CONCIERGE_ID / SB_CONCIERGE_PASSWORD が未設定です"
    );
  }

  const browser = await chromium.launch({ headless: HEADLESS !== "0" });
  const context = await browser.newContext({ locale: "ja-JP" });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    step("info", "login", "ログインします");
    await login(page, {
      loginUrl: SB_CONCIERGE_LOGIN_URL,
      id: SB_CONCIERGE_ID,
      password: SB_CONCIERGE_PASSWORD,
    });

    step("info", "navigate", "回線一覧へ移動します");
    await gotoLineList(page);

    const rows = [];
    const seen = new Set();
    let colMap = null;
    let pageNo = 1;
    let complete = true;

    while (pageNo <= Number(MAX_PAGES)) {
      const rawRows = await readPage(page);

      if (rawRows.length === 0) {
        step("warn", "read", `${pageNo}ページ目が0件でした`);
        break;
      }

      if (!colMap) {
        colMap = buildColumnMap(Object.keys(rawRows[0]));
        step("info", "read", `列の対応: ${JSON.stringify(colMap)}`);
        if (!colMap.phoneNumber) {
          throw new Error(
            `電話番号の列を特定できません。見出し: ${Object.keys(rawRows[0]).join(", ")}`
          );
        }
      }

      for (const raw of rawRows) {
        const row = toRow(raw, colMap);
        // ページ送りが効かず同じページを読み続ける事故を検知する
        const key = (row.phoneNumber ?? "").replace(/\D/g, "");
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        rows.push(row);
      }

      step("info", "read", `${pageNo}ページ目: ${rawRows.length}件（累計 ${rows.length}件）`);

      const hasNext = await gotoNextPage(page);
      if (!hasNext) break;
      pageNo++;

      if (pageNo > Number(MAX_PAGES)) {
        // 取り切れていないので解約判定をさせない
        complete = false;
        step("warn", "read", `${MAX_PAGES}ページで打ち切りました`);
      }
    }

    step("info", "done", `合計 ${rows.length}件を取得しました`);
    await report({ rows, log, complete });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    step("error", "failed", message);
    // 失敗も必ず本体に返す。無通知＝成功にしないため
    await report({ error: message, log }).catch((sendErr) => {
      console.error("失敗の報告にも失敗しました:", sendErr);
    });
    throw e;
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
