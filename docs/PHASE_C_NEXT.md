# Phase C（コンシェルからの日次取得）— 次にやること

**最終更新：** 2026年9月16日

土台は実装済みで、モックサイト相手に通しの動作確認まで終わっている。
残りは「実サイトにつなぐ」「動かす場所を作る」の2つ。

---

## いまどこまでできているか

| 部分 | 状態 |
|---|---|
| 起動API（Scheduler / 画面ボタン） | 実装済み `src/app/api/concierge/sync/route.ts` |
| 結果受け取り＋差分生成＋DB反映 | 実装済み `src/app/api/concierge/observed/route.ts` |
| Playwrightボット本体 | 実装済み `jobs/concierge-bot/index.mjs` |
| 画面の「コンシェルから取得」ボタン | 実装済み |
| モックサイトでの通し確認 | 済（差分なし／IMEI変更／解約／ログイン失敗の4パターン） |
| **実サイト用のロケーター** | **未（codegenの録画待ち）** |
| **Cloud Run Job `concierge-bot`** | **未作成** |
| **Cloud Scheduler** | **API未有効** |

---

## 1. ロケーターを実サイト用に差し替える

**触るのは `jobs/concierge-bot/site.mjs` だけ。** `index.mjs` は変更しない。

```bash
cd jobs/concierge-bot
npm install
npx playwright install chromium
SB_CONCIERGE_LOGIN_URL=https://<コンシェルのURL> npm run codegen
```

録画した操作を4つの関数に写す。`TODO(codegen)` のコメントが目印。

| 関数 | 約束 |
|---|---|
| `login(page, {loginUrl, id, password})` | 失敗したら throw する |
| `gotoLineList(page)` | 回線一覧のページまで移動する |
| `readPage(page)` | 表示中の表を `[{見出し: 値}, ...]` で返す |
| `gotoNextPage(page)` | 進めたら true、最終ページなら false |

列見出しの表記ゆれは `COLUMN_ALIASES` に候補を足せば吸収できる。

### 差し替えたら、まず送信せずに確認する

```bash
cd jobs/concierge-bot
SB_CONCIERGE_LOGIN_URL=https://... \
SB_CONCIERGE_ID=... SB_CONCIERGE_PASSWORD=... \
HEADLESS=0 node index.mjs
```

`CALLBACK_URL` を省くと本体に送らず、取得結果を標準出力に出すだけになる。
**確認すること：**

- 「列の対応」のログに `phoneNumber` が入っているか（無いと必ず失敗する）
- ページ送りが最後まで進むか（累計件数が3,500件前後になるか）
- IMEI/ICCIDが桁数どおり取れているか

---

## 2. Cloud Run Job を作る

```bash
cd jobs/concierge-bot
gcloud builds submit --tag gcr.io/widsley-dx/concierge-bot

gcloud run jobs create concierge-bot \
  --image gcr.io/widsley-dx/concierge-bot \
  --region asia-northeast1 \
  --memory 2Gi \
  --task-timeout 30m \
  --max-retries 0
```

- **メモリは2Gi以上**。Chromiumは512MiBでは動かない（PERF-02と同じ轍を踏まない）
- **リトライは0**。同じ取得を二重に走らせても差分が増えるだけで意味がない
- **DBをマウントしない**。INV-1（DBに書くのは本体サービスだけ）を守るため

### 環境変数（Jobのみ・本体サービスには設定しない）

| 変数 | 内容 |
|---|---|
| `SB_CONCIERGE_LOGIN_URL` | コンシェルのログインURL |
| `SB_CONCIERGE_ID` | ログインID |
| `SB_CONCIERGE_PASSWORD` | パスワード |

`RUN_ID` / `CALLBACK_TOKEN` / `CALLBACK_URL` は本体がJob起動時に上書きで渡すので、
ここでは設定しない。

**認証情報はSecret Managerに置くことを推奨**（`docs/DEPLOYMENT.md` の未対応項目）。
外部サービスのログイン情報を平文の環境変数に置いたままにしない。

### 本体サービス側に必要な設定

| 変数 | 内容 |
|---|---|
| `CONCIERGE_JOB_NAME` | `concierge-bot`（既定値と同じなら省略可） |
| `CONCIERGE_JOB_REGION` | `asia-northeast1`（同上） |
| `APP_BASE_URL` | ボットが結果を返す先。例 `https://line-management-...run.app` |

本体のサービスアカウントに **`roles/run.invoker`**（Job起動用）が要る。

---

## 3. Cloud Scheduler で毎朝8時に回す

```bash
gcloud services enable cloudscheduler.googleapis.com

gcloud scheduler jobs create http concierge-daily \
  --location asia-northeast1 \
  --schedule "0 8 * * *" \
  --time-zone "Asia/Tokyo" \
  --uri "https://<本体URL>/api/concierge/sync" \
  --http-method POST \
  --headers "x-scheduler-token=<SCHEDULER_TOKENと同じ値>"
```

本体サービスに `SCHEDULER_TOKEN` を設定しておく。未設定だとトークン認証が通らず、
ログインセッションのない Scheduler からは起動できない。

---

## 動かす前に必ず確認すること

**回線マスタが埋まっていること。** 本番の `mobile_lines` は社内28件しかない
（2026/09/16時点）。この状態で全件取得すると、コンシェル側の約3,500回線が
すべて「新規開通」の差分として積み上がり、1件ずつ取引先を選んで承認する羽目になる。

順序は **回線マスタを入れる → Phase C を回す**。

---

## 事故を防ぐために入れてある仕掛け

ロケーターが外れたときに台帳を壊さないための作り。**消さないこと。**

| 仕掛け | 理由 |
|---|---|
| 取得0件は失敗扱い（`observed/route.ts`） | そのまま進めると全回線が「解約」提案になる |
| ログイン失敗をその場で throw（`site.mjs`） | 気づかず空の一覧を取る事故を防ぐ |
| 取り切れなければ `complete: false` を送る | 解約判定をさせない。「見えなかっただけ」を解約にしない |
| 同じ電話番号は1回だけ数える（`index.mjs`） | ページ送りが効かず同じページを読み続ける事故を検知する |
| 実行履歴はJob起動の前に作る（INV-3） | 落ちても記録が残る。無通知＝成功にしない |

---

## 動作確認用のダミーサイト

実サイトなしで通しの確認ができる。**開発環境でのみ表示され、本番では404になる。**

```
/mock-concierge/login?scenario=<なし|imei|removed|added>
```

| シナリオ | 出る差分 |
|---|---|
| （なし） | 0件（マスタと一致） |
| `imei` | `imei_changed` 1件 |
| `removed` | `line_removed` 1件 |
| `added` | `line_added` 1件 |

ローカルでは Cloud Run Job を起動できないため、`/api/concierge/sync` を叩くと
実行履歴が `queued` のまま残り、サーバーログにボットの実行コマンドが出る。
それをコピーして手で流す。
