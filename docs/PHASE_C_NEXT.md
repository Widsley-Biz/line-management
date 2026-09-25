# Phase C（コンシェルからの日次取得）— 次にやること

**最終更新：** 2026年9月25日

土台は実装済み。ロケーターも実サイトで確認済み。
残りは「動かす場所を作る」（Cloud Run Job と Scheduler）。

---

## いまどこまでできているか

| 部分 | 状態 |
|---|---|
| 起動API（Scheduler / 画面ボタン） | 実装済み `src/app/api/concierge/sync/route.ts` |
| 結果受け取り＋差分生成＋DB反映 | 実装済み `src/app/api/concierge/observed/route.ts` |
| Playwrightボット本体 | 実装済み `jobs/concierge-bot/index.mjs` |
| 画面の「コンシェルから取得」ボタン | 実装済み |
| モックサイトでの通し確認 | 済（差分なし／IMEI変更／解約／ログイン失敗の4パターン） |
| **実サイト用のロケーター** | **実装済み（2026-09-25 に実画面で確認）** |
| セットアップ手順 | `jobs/concierge-bot/setup.sh` に用意済み |
| **Cloud Run Job `concierge-bot`** | **未作成（setup.sh deploy で作る）** |
| **Cloud Scheduler** | **未作成（setup.sh schedule で作る）** |

---

## 1. 実サイトの構造（2026-09-25 実画面で確認済み）

`jobs/concierge-bot/site.mjs` に反映済み。サイトが変わったらここだけ直す。

### URL

| 用途 | URL |
|---|---|
| ログイン | `https://portal.business.mb.softbank.jp/portal/BPS0001/index` |
| 回線情報の照会 | `https://portal.business.mb.softbank.jp/portal/admin/line/BPS0201/index` |

導線は TOP →「回線情報管理」→「回線情報の照会」だが、ログイン後は一覧URLへ直接飛べる。

### ログイン画面

| 項目 | 値 |
|---|---|
| フォーム | `form[name="BPS0101ActionForm"]` → POST `/portal/BPS0101/login` |
| 管理者ID | `input[name="authId"]` |
| パスワード | `input[name="pwd"]` |
| ログイン | **`<a>` リンク**（`javascript:void(0)`）。`<button>` ではない |

### 一覧の構造（ここが肝）

列が**固定列と横スクロール列の2つの表に分かれている**。行番号で突き合わせる。

| 役割 | セレクタ | 持っている列 |
|---|---|---|
| 左の見出し | `.header_left table` | 選択 / No. / ステータス / グループ名 / 電話番号 |
| 右の見出し | `.header_right_content_wrapper table` | SIM種別 / ICCID / PUK / 機種契約番号 / IMEI / 機種名 / 氏名 / 部署名 / 各種サービス |
| 左の本体 | `.body_left_content_wrapper table.tableControl` | 〃 |
| 右の本体 | `.ui-flickable-content table.tableControl` | 〃 |

各 `th` が `<div class="column_name">` に**内部フィールド名**を持っている。日本語ラベルより
安定するのでこちらを使う。

| 内部名 | 意味 |
|---|---|
| `msn` | 電話番号 |
| `equipmentSerialNbr` | ICCID |
| `newestImei` | 製造番号（IMEI） |
| `personNm` | 氏名 |
| `deptNm1` | 部署名(1) |
| `status` | ステータス |

注意: 「利用可能サービス」はサブ列23個を束ねるグループ見出しで名前を持たない。
`colspan` の分だけ読み飛ばさないとデータ列と位置がずれる（実装済み）。

### ページ送り

`select[name="tableControlDto.pageViewCount"]`（50 / 100 / **200**）と
hidden の `tableControlDto.pageNum`。`gotoLineList` で200件表示にしている。

**社内28回線は1ページに収まるため、ページ送りは未検証。**複数ページある
アカウントで動かすときは、最初に必ず「ご利用回線数」と取得件数を突き合わせること。

### CSVダウンロードでは代替できない

一覧画面には2つのダウンロードがあるが、**どちらもICCIDを持っていない**。

| 取得元 | 電話番号 | 氏名 | IMEI | ICCID |
|---|:--:|:--:|:--:|:--:|
| 一括登録用ファイル（`a#download`） | ○ | ○ | × | × |
| レンタル契約情報（`a#dlRentCntInfCsv`） | ○ | × | ○ | × |
| **画面の表** | ○ | ○ | ○ | **○** |

ICCIDは番号変更の判定（同じICCIDで番号が変わったら機種そのままの番号変更）に
必須なので、画面から取る必要がある。

なおレンタル契約情報CSVには確認ダイアログで次の但し書きが出る:
**前日時点の情報**であること、端末交換後はIMEIが画面と食い違う場合があること、
再ダウンロードは数分間できないこと。日次同期で使うなら画面側を正とする。

### 動作確認の結果（株式会社Widsley / 28回線）

28件すべてで 電話番号・ICCID・IMEI を取得、電話番号の重複0。
200件表示に切り替えたあとも同じ結果。氏名は社内回線のため全件空欄。

### 手を入れたら、まず送信せずに確認する

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

## 2〜4. 本番で動かす（`jobs/concierge-bot/setup.sh`）

必要な手順はスクリプトにまとめてある。**何度実行しても同じ結果になる**ので、
途中で失敗したらそのまま再実行してよい。

```bash
cd jobs/concierge-bot
gcloud auth login          # 期限が切れやすいので毎回確認する

./setup.sh secrets    # 1. 認証情報を Secret Manager に登録（画面で直接入力）
./setup.sh deploy     # 2. イメージをビルドして Cloud Run Job を作る
./setup.sh wire       # 3. 本体から Job を起動できるようにする
./setup.sh schedule   # 4. 毎朝8時の自動実行を作る

./setup.sh status     # どこまでできているか確認
./setup.sh run        # 手動で1回流してみる
```

`./setup.sh all` で 1〜4 を続けて実行できる。

### 何を作るか

| 種別 | 名前 | 中身 |
|---|---|---|
| Secret | `sb-concierge-id` / `sb-concierge-password` | コンシェルのログイン情報。**対話入力なので画面にもログにも残らない** |
| Secret | `scheduler-token` | Scheduler からの起動を認証する。`openssl rand` で自動生成 |
| サービスアカウント | `concierge-bot@…` | **Job専用。Secret の読み取り以外の権限を一切持たない** |
| Cloud Run Job | `concierge-bot` | メモリ2Gi / リトライ0 / DBはマウントしない |
| Scheduler | `concierge-daily` | 毎朝8時（日本時間）に `/api/concierge/sync` をPOST |

### なぜ Job 専用のサービスアカウントを作るのか

INV-1（DBに書くのは本体サービスだけ）を、コードの約束だけでなく**IAMでも担保する**ため。
このSAには Secret の読み取りしか与えていないので、仮にボットがDBを触ろうとしても
権限で弾かれる。本体のSAを流用しないこと。

### 環境変数の対応

| どこに | 変数 | 出どころ |
|---|---|---|
| Job | `SB_CONCIERGE_LOGIN_URL` | 平文（公開URLなので秘密ではない） |
| Job | `SB_CONCIERGE_ID` / `SB_CONCIERGE_PASSWORD` | Secret Manager |
| Job | `RUN_ID` / `CALLBACK_TOKEN` / `CALLBACK_URL` | **本体が起動時に上書きで渡す**（設定不要） |
| 本体 | `CONCIERGE_JOB_NAME` / `CONCIERGE_JOB_REGION` / `APP_BASE_URL` | `setup.sh wire` が設定 |
| 本体 | `SCHEDULER_TOKEN` | Secret Manager |

### 注意：コード変更のデプロイ後に確認すること

本体の環境変数は `gcloud run services update` で入れている。main への push で走る
Cloud Build が `--set-env-vars` を使う作りだと**上書きで消える可能性がある**。
最初のコードデプロイのあと一度だけ `./setup.sh status` と、本体の環境変数に
`APP_BASE_URL` が残っているかを確認すること。消えていたら `./setup.sh wire` を再実行する。

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
