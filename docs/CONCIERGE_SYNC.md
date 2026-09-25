# SB法人コンシェル同期

携帯回線の管理をコンシェルサイト上の手作業から LineHub 側へ移すための仕組み。
Notion の仕様書はこのファイルを元にする。**コードを変えたらこのファイルも同じPRで直すこと。**

## 何を解決するのか

これまでコンシェルサイト上で人が行っていた3つの作業を、LineHub 側で検知・管理する。

1. 電話番号に対して「氏名」欄に提供先の会社名を記載する（新規開通時）
2. 電話番号が変わったときも氏名欄に会社名を登録し直す
3. 故障・紛失で端末交換するとIMEI/ICCIDが変わるので、その確認

## どちらを正とするか（迷ったらここを見る）

| 項目 | 正 | 向き |
|---|---|---|
| 電話番号 | **SB** | SB → 台帳 |
| IMEI | **SB** | SB → 台帳 |
| ICCID | **SB** | SB → 台帳 |
| 回線の存在（開通・解約） | **SB** | SB → 台帳 |
| 氏名（提供先会社名） | **LineHub** | 台帳 → SB |

SBが正の項目も**自動では上書きしない**。差分を出して人が承認する。

## 3つの作業と差分種別の対応

| 観測されたこと | 意味 | diff_type | 承認すると |
|---|---|---|---|
| 同じICCIDで電話番号が変わった | 番号変更（作業2） | `number_changed` | 台帳の番号を更新し、**氏名欄の修正提案も自動生成** |
| 同じ電話番号でIMEIが変わった | 端末交換・故障紛失（作業3） | `imei_changed` | 台帳のIMEIをSBに合わせる |
| 同じ電話番号でICCIDが変わった | SIM再発行（作業3） | `iccid_changed` | 台帳のICCIDをSBに合わせる |
| SBにあって台帳にない | 新規開通（作業1の起点） | `line_added` | 提供先を選んで台帳に登録 |
| 台帳にあってSBにない | 解約 | `line_removed` | 台帳を解約済にする |
| 氏名欄 ≠ 取引先の会社名 | 氏名欄の登録漏れ・誤り（作業1・2） | `name_mismatch` | 承認どまり。コンシェルへの書き込みは Phase D |

`number_changed` と `line_added` は `name_mismatch` を連鎖生成する。
**「番号が変わったのに氏名欄を直し忘れる」という一番起きやすい漏れが構造的に拾われる。**

## データの流れ

```
請求ファイル取込（/import）        Playwrightでの日次取得（Phase C・土台実装済み）
        │ source='billing_csv'              │ source='concierge'
        └──────────────┬───────────────────┘
                       ▼
              concierge_lines（SB側の現状ミラー・電話番号ごとに1行）
                       │  computeDiffs()（純関数・DB非依存）
                       ▼
              concierge_diffs（提案 → 承認 → 反映。削除しない＝変更記録の本体）
                       │  ★承認APIだけが台帳を触る
                       ▼
                 mobile_lines（台帳）
```

### テーブルの役割

| テーブル | 役割 |
|---|---|
| `concierge_sync_runs` | 実行履歴。**処理を始める前**に行を作るので、途中で落ちても記録が残る |
| `concierge_lines` | SB側の現状ミラー。新しい観測が古い観測を上書きする（`observed_at` で判定） |
| `concierge_diffs` | 差分。終端（applied/rejected/superseded）になっても**削除しない**。`WHERE phone_key=?` で1本の履歴が出る |
| `notifications` | アプリ内お知らせ。Slackへ送ったかも `slack_status` に残る |
| `mobile_lines` | 台帳。`imei` / `iccid` / `phone_key` / `concierge_*` を追加 |

## 差分の状態遷移

```
                    ┌──── 却下 ──────────────────→ rejected  [終端]
                    │
[同期] → pending ───┼──── 承認 ─────→ approved ──┬→ applied  [終端]
                    │                             └→ failed
                    └─ 後続の同期で解消/値が変化 ─→ superseded [終端]
```

毎朝走っても承認待ちの行はリセットされない。提案値が同じなら据え置き、
変わったときだけ旧行を `superseded` にして作り直す。
部分ユニークインデックス `idx_concierge_diffs_open` が二重承認をDBレベルで禁止している。

## 実行タイミング

| いつ | 何が起きるか | 状態 |
|---|---|---|
| 請求ファイルを `/import` で取り込んだとき | メタデータ列（ICCID・IMEI・氏名・部署・料金プラン）を拾って差分を作る | **実装済み** |
| 毎朝8時（Cloud Scheduler） | Playwrightでコンシェルから全回線を取得して差分を作る | Phase C（Scheduler未設定） |
| 画面の「コンシェルから取得」ボタン | 上と同じ処理を手動で起動 | 実装済み |

## いま台帳がいつ時点の情報なのか

**請求ファイルは「その請求月の断面」であり、全回線の一覧ではない。**

- CSVで分かるのは **その月に課金のあった回線の、その時点の値**
- それ以降の新規開通・機種変更・番号変更・解約は**入っていない**
- したがって「CSVに無い＝解約」とは判定しない（`detectRemovals: false`）

コンシェル同期の画面には最終観測日時と出どころを常に表示している。
**Phase C を完了させるまで、台帳を「現在の正」として扱わないこと。**

## 通知

| イベント | レベル | Slack |
|---|---|---|
| 同期失敗・タイムアウト | error | ✅ |
| 書き込み競合を検知（Phase D） | warn | ✅ |
| 差分が見つかった | info | ✅ |
| 同期成功・差分0件 | — | 通知しない（履歴には残る） |

ダッシュボードに「最終実行」と「未承認の差分」を常時表示し、
36時間以上成功がなければ赤くする。**「無通知＝成功」を成立させない。**

### 通知が来たら何をするか

- **同期失敗** → コンシェル同期画面の実行履歴でエラー内容を見る。パスワード変更・画面改修が原因のことが多い
- **差分が見つかった** → コンシェル同期画面で内容を確認して承認/却下する
- **書き込み競合**（Phase D）→ 承認してから反映までの間に誰かがコンシェル側を手で直した。新しい差分が作り直されているので再確認する

## 運用手順

### 請求ファイルから台帳を作る（初回・月次）

1. `/import` で SoftBank の請求ファイルを取り込む（従来どおり。請求集計の動作は変わらない）
2. `/mobile/concierge` を開く
3. 「新規開通」で絞る → **SBの氏名欄ごとの件数**から会社名をクリックして絞り込む
   - 緑のチップ＝取引先マスタに登録済み。未登録の会社は先に `/tenants` で作る
4. ヘッダのチェックボックスで全選択（1ページを超える場合は「検索結果◯件すべてを選択する」）
5. 割当先を確認して「承認して反映」

会社名の絞り込みは**完全一致**。部分一致にすると「株式会社ライ」で「株式会社ライド」まで拾ってしまい、
よその会社の回線を取り込む事故になるため。

### IMEI/ICCIDの変更を確認する

「端末交換」「SIM再発行」で絞る → 内容を確認して一括承認。SBが正なので基本は承認一択。

## 値の検証

請求ファイルはExcelを経由すると IMEI が `3.57E+14` のように指数表記へ丸められることがある。

| ファイル | IMEI |
|---|---|
| `billing_priceitem (44).csv` | `356568910822051`（15桁・健全） |
| `SB超過代金2026_06請求（26_04利用分）…csv` | `3.57E+14`（丸め破損） |

そのため取り込み時に検証し、**壊れた値は捨てて警告に積む**。
- IMEI: `^\d{15}$` でなければ `null`
- ICCID: `^\d{19,20}$` でなければ `null`

同じ電話番号が複数行にある（期間中に端末交換があると機種契約番号とIMEIが異なる行が並ぶ）場合は
後勝ちで1行に畳み、IMEIが複数あれば警告に出す。

## 障害時の手順

| 症状 | 見るところ | 対処 |
|---|---|---|
| 差分が出ない | `/mobile/concierge` の最終観測・最終実行 | 請求ファイルが取り込めているか確認 |
| 取込は成功したのに差分が0 | `concierge_sync_runs.log_json` | 列検出に失敗していないか（`電話番号の列が見つかりませんでした`） |
| 承認でエラー | 画面のエラー欄 / `concierge_diffs.error_message` | 該当行は `failed` になる。原因を直して再実行 |
| 台帳を戻したい | `/activity`（更新履歴）の `concierge_approve` | `afterJson.changes` に変更前後が残っている。手動で戻す |

## 環境変数

| 変数 | どこに置くか | 用途 |
|---|---|---|
| `SLACK_WEBHOOK_URL` | 本体 Cloud Run | Slack通知。未設定ならスキップ |
| `APP_BASE_URL` | 本体 Cloud Run | 通知内リンクを絶対URLにする |
| `SB_CONCIERGE_ID` / `SB_CONCIERGE_PASSWORD` | **Cloud Run Job のみ**（Phase C） | コンシェルのログイン。本体サービスには設定しない |
| `SCHEDULER_TOKEN` | 本体 Cloud Run（Phase C） | Cloud Scheduler からの起動を認証する |

## 設計上の約束（変更するときに壊してはいけないこと）

| # | 約束 | 破ると |
|---|---|---|
| INV-1 | `/data/lime.db` に書くプロセスは常に1つ（本体 Cloud Run サービスのみ） | GCS-FUSE + `journal_mode=DELETE` でDB破損。Playwright は別 Job にしてHTTP経由で渡す |
| INV-2 | 同期処理は `mobile_lines` を更新しない。差分テーブルにしか書かない | 「自動上書きしない」という要件そのものが崩れる |
| INV-3 | 実行履歴の行はジョブ起動の**前**に作る | 落ちたときに記録が残らず、欠落に気づけない（PERF-02 の再演） |

その他:
- `runInTransaction()` は**入れ子にできない**。請求取込の中で差分生成を呼ぶときは既存ブロックの内側に書く
- 差分生成で例外が出ても請求取込は完走させる（try/catch で握りつぶす）。取りこぼしても次回の取込で upsert し直される

## 実装の場所

| 役割 | パス |
|---|---|
| 差分計算（純関数・DB非依存） | `src/lib/concierge/diff.ts` |
| 取り込み（ミラー更新＋差分生成） | `src/lib/concierge/ingest.ts` |
| 実行履歴 | `src/lib/concierge/runs.ts` |
| ラベル | `src/lib/concierge/labels.ts` |
| 承認API（**台帳を触れる唯一の場所**） | `src/app/api/concierge/diffs/route.ts` |
| 差分承認画面 | `src/app/(dashboard)/mobile/concierge/` |
| 請求取込への組み込み | `src/app/api/billing/import/route.ts` |
| 同期の起動（Scheduler / 画面ボタン） | `src/app/api/concierge/sync/route.ts` |
| ボットからの結果受け取り（**DBに書くのはここ**） | `src/app/api/concierge/observed/route.ts` |
| Cloud Run Job の起動 | `src/lib/concierge/job.ts` |
| 受信データの正規化 | `src/lib/concierge/observed-payload.ts` |
| Playwrightボット本体 | `jobs/concierge-bot/index.mjs` |
| **サイト依存（codegenで差し替える唯一の場所）** | `jobs/concierge-bot/site.mjs` |
| 動作確認用のダミーサイト（開発環境のみ） | `src/app/mock-concierge/` |
| 通知 | `src/lib/notify.ts` / `src/lib/slack.ts` |
| 認可ヘルパー | `src/lib/api-auth.ts` |
| マイグレーション | `drizzle/migrations/0012_concierge_sync.sql` |

### 検証のしかた（テストフレームワーク未導入のため）

差分計算は純関数なので `npx tsx` で実データを食わせて目視確認できる。
`src/lib/concierge/diff.ts` の `parseSoftBankMetaRows` / `computeDiffs` を直接呼ぶスクリプトを書く。
**最初に確かめるのは、壊れたIMEI（`3.57E+14`）が弾かれ、15桁のIMEIが通ること。**

## 未対応・既知の制約

- **Phase C は土台のみ**。パイプラインはモックサイトで通しの動作確認済みだが、
  次の3つが残っている。完了するまで台帳は請求ファイルの断面までしか追いつかない
  - ロケーターは実サイトで確認済み（2026-09-25）。ただし全体を通した実行は未（認証情報が要る）
  - Cloud Run Job `concierge-bot` が未作成
  - Cloud Scheduler API が未有効（日次実行が動かない）
- **Phase D（氏名欄のコンシェルへの書き込み）が未実装**。`name_mismatch` は承認までで止まる
- 取引先マスタは12社だが、請求ファイルには数百社分・3,561回線がある。大半は取引先未登録
- `src/middleware.ts` の matcher が `/api` を除外しているため、**既存の `/api/*` は認証を通らない**。
  今回追加した `/api/concierge/*` はハンドラ内で個別に認可している。既存分は別タスク
- Secret Manager 未導入（環境変数に平文）
- `TASKS.md` PERF-02（CDR取込のOOM）は未解決。本機能とは無関係だが、メモリ 512MiB のままである点は共通のリスク
