# TASK.md — IP回線改修 引き継ぎ資料

**作成日：** 2026年7月10日
**引き継ぎ先：** CS（開発環境：macOS）
**参照ドキュメント：** `docs/LineHub_IP回線改修_要件定義書.md`（確定版）

---

## 1. 現在の状態

要件定義書の **Phase A〜D は実装完了**。**Phase E（初期データ移行・実CDR検証・旧テーブル削除）が未実施**で、これが主な残タスクです。

| Phase | 内容 | 状態 |
|---|---|---|
| A | DB・マスタ整備（新テーブル5つ / `/ip/master` / `/ip/tariffs`） | ✅ 完了 |
| B | CDR取込・計算ロジック | ✅ 完了 |
| C | 画面刷新（`/import` / ダッシュボード / `/ip/billing` / `/ip/numbers` / サイドメニュー） | ✅ 完了 |
| D | SF連携（CC_01 / CC_02）・旧機能廃止 | ✅ 完了 |
| E | 初期データ投入・実CDR検証・旧テーブル削除 | ⬜ **未実施（→ §4）** |

**検証済みの内容**（一時DBでロジックを直接実行して確認）：

- 通話種別4パターン分類（全角括弧の揺れ吸収を含む）
- タリフ計算とSF商品単位の切り上げ（固定=ceil / 携帯＋ナビ=ceil の2回）
- 表番号・裏番号の名寄せ、未紐付け番号の警告
- 同一ファイル（SHA-256ハッシュ一致）のスキップ
- 差分ファイルの追記取込 → 金額再計算 → SFステータスの「未送信」リセット
- Shift-JIS復号（UTF-8ファイルの自動判別を含む）
- 取引先別タリフ上書きの適用

`npm run build`（TypeScriptチェック含む）通過済み。lintに残る3エラーは改修前から存在する `scripts/seed-billing-items.js` 由来（今回の変更と無関係）。

---

## 2. Macでのセットアップ

### 前提

- **Node.js 20以上**（開発時はv24で確認）
- **Xcode Command Line Tools**（`better-sqlite3` のネイティブビルドに必要）
  ```bash
  xcode-select --install
  ```

### 手順（既存のローカル環境を更新する場合）

リポジトリが手元にある前提。**既存の `lime.db` はそのまま使えます**（今回の改修は旧テーブルを削除していないため、マイグレーションで新テーブルが追加されるだけです）。

```bash
git pull origin main
npm install          # 依存関係の更新（package.jsonのスクリプト整理を含む）
npm run db:migrate   # マイグレーション0008を適用（IP新テーブル作成＋デフォルトタリフ投入）
npm run dev          # http://localhost:3000
```

- `.env.local` は既存のものを継続利用可。ただし**IP回線のSF送信には新しい環境変数が必要**（下表の `SF_PRICEBOOK_ENTRY_ID_CC01` / `CC02`）
- `npm run db:seed` は不要（既存DBの場合。デフォルトタリフはマイグレーションで投入済み）

### 手順（ゼロから構築する場合）

```bash
git clone https://github.com/Widsley-Biz/line-management.git
cd line-management
npm install
touch .env.local     # 環境変数を設定（下表参照）
npm run db:migrate
npm run db:seed      # 初期ユーザー・デフォルトタリフ投入
npm run dev
```

初期ログイン: `ryuji.kawakami@widsley.com` / `Widsley2024!`

### 環境変数一覧（.env.local）

| 変数 | 用途 | 必須 |
|---|---|---|
| `AUTH_SECRET` | NextAuth v5 セッション署名（`openssl rand -base64 32` で生成） | ◯ |
| `NEXTAUTH_URL` | アプリのURL（ローカルは `http://localhost:3000`） | ◯（SF OAuth利用時） |
| `SF_CLIENT_ID` / `SF_CLIENT_SECRET` | SF Connected App | ◯（SF送信時） |
| `SF_LOGIN_URL` | SFログインURL（既定 `https://login.salesforce.com`） | 任意 |
| `SF_INSTANCE_URL` | client_credentials用インスタンスURL | 任意 |
| `SF_PRICEBOOK2_ID` | 商談にセットする価格表ID | ◯（SF送信時） |
| `SF_PRICEBOOK_ENTRY_ID_CC01` | **CC_01（IP回線通話料_国内固定番号宛）のPricebookEntry ID** | ◯（IP SF送信時）**※未設定・要確認** |
| `SF_PRICEBOOK_ENTRY_ID_CC02` | **CC_02（IP回線通話料_国内携帯番号宛）のPricebookEntry ID** | ◯（IP SF送信時）**※未設定・要確認** |
| `SF_PRICEBOOK_ENTRY_ID_MOBILE` | 携帯回線超過分のPricebookEntry ID（既存） | ◯（携帯SF送信時） |
| `NEXT_PUBLIC_SF_ORG_URL` | 商談リンク表示用のSF組織URL | 任意 |
| `DATABASE_URL` | SQLiteファイルパス（既定 `lime.db`） | 任意 |

> 実運用中の値は現行運用者（Windows機の `.env` / 本番サーバー）から引き継いでください。**CC_01 / CC_02 のPricebookEntry IDは新規に必要**です（SFの価格表で該当2商品のエントリIDを確認）。

### Mac特有の注意

- 今回の開発機（Windows）では `next build` 時にGoogle Fonts取得でTLSエラーが出たため `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` を付けてビルドしました。Macでは通常不要ですが、社内プロキシ環境で同様のエラーが出たら同じ環境変数で回避できます。
- SQLite DBファイル（`lime.db`）はリポジトリに含まれません。実データが必要な場合は運用中のDBファイルをコピーしてください（コピー後 `npm run db:migrate` で0008を適用）。

---

## 3. 今回の改修内容（全体像）

### 新フロー

```
CDR CSV（Shift-JIS / 月6ファイル程度）を /import からアップロード
  → 通話種別を4パターンに自動分類（H列）
  → タリフ（取引先別 or デフォルト）で通話料を自動計算
  → 番号マスタ（表番号・裏番号）で取引先に名寄せ
  → /ip/billing で確認 → SFに2商品（CC_01 / CC_02）で登録
```

### 計算ルール（要件定義書 §7）

| パターン | H列の通話種別名称 | 計算式 | デフォルトタリフ |
|---|---|---|---|
| ① 固定 | 国内通話料(固定宛) / 国内通話料(IP宛) / フリーコール通話料(固定着) | 秒 × タリフ | 0.06円/秒 |
| ② 携帯 | 国内通話料(携帯宛) / フリーコール通話料(携帯着) | 秒 × タリフ | 0.25円/秒 |
| ③ ナビ秒 | ナビダイヤル | 秒 × タリフ | 1.2円/秒 |
| ④ ナビ金額 | その他料金 | O列金額 × タリフ | 10.5倍 |

- 端数処理：**SF商品単位で切り上げ2回**（①固定分 / ②＋③＋④携帯＋ナビ分）。番号単位の内訳は小数のまま保持
- 請求月 = **利用月＋1ヶ月**（携帯の＋2ヶ月と異なる）
- 取込は**差分投入**：同一内容ファイルはハッシュでスキップ、内容が異なれば追記して自動再集計（再集計時にSFステータスは「未送信」に戻る）
- タリフ変更は**変更後に取り込んだCDRから適用**（遡及再計算はしない。必要なら該当月の明細を消して再取込）

### 新規テーブル（`drizzle/migrations/0008_ip_line_revamp.sql`・`0009_ip_unmatched.sql`）

`ip_numbers`（番号マスタ・裏番号付き） / `ip_tariffs`（tenant_id NULL=デフォルト） / `ip_usages`（月次・切り上げ後金額） / `ip_usage_details`（番号×通話種別内訳） / `ip_import_files`（取込履歴・ハッシュ） / `ip_import_unmatched`（未紐付け番号・0009）

### 新規・変更ファイルの要点

| 種別 | パス | 内容 |
|---|---|---|
| コアロジック | `src/lib/ip-billing.ts` | 分類・タリフ取得・計算・再集計・請求月計算 |
| コアロジック | `src/lib/cdr-import.ts` | CDRファイル取込の本体（復号・パース・名寄せ・集計・履歴） |
| API | `src/app/api/ip/import` | CDR取込（複数ファイル対応） |
| API | `src/app/api/ip/master`・`master/import` | 番号マスタCRUD・CSV一括登録 |
| API | `src/app/api/ip/tariffs` | デフォルト更新・取引先別上書き・解除 |
| API | `src/app/api/ip/send-sf` | CC_01/CC_02の2商品でOpportunityLineItem登録 |
| API | `src/app/api/ip/export` | 全社CSV（summary）・番号別CSV（numbers） |
| API | `src/app/api/ip/unmatched`・`billing-status` | 未照合番号の割当/無視・対応不要ステータス変更 |
| 画面 | `/ip/master` `/ip/tariffs` `/ip/billing/[yearMonth]` `/ip/numbers` `/ip/sf-pending` `/ip/unmatched` | 携帯回線と同構成の新画面 |
| 画面 | `/import`・ダッシュボード・サイドメニュー・取引先一覧/詳細 | 新構成へ刷新 |

### 廃止したもの

- AdjustOne / ProDelight CSV取込（`/api/billing/import` はSoftBank専用に縮小）
- パック管理・超過料金計算（画面・ロジック・スキーマ定義・シード）
- 旧IP画面：`/billing-accounts` `/billing` `/unit-ch`、`src/lib/billing.ts`、関連コンポーネント
- `packs` / `tenant_packs` / `monthly_usages` / `call_logs` のスキーマ定義（**DBのテーブル自体は未削除** → §4）

---

## 4. 残タスク（Phase E ほか）

**着手条件：新構造の動作確認が済んでから**（要件定義書 §15。実装と並行しない）。

1. **SF商品設定**
   - [ ] SFでCC_01 / CC_02のPricebookEntry IDを確認し、`SF_PRICEBOOK_ENTRY_ID_CC01` / `CC02` を本番`.env`に設定
   - [ ] 設定画面（`/settings`）下部で設定状況を確認できる

2. **番号マスタ初期データ移行**
   - [ ] 旧 `phone_numbers`（取引先紐付けは `channel_groups.tenant_id` または `tenant_assignments` 経由）→ `ip_numbers` へ移行
   - [ ] 裏番号（フリーダイヤル）の紐付け登録（旧 `phone_numbers.free_call` 列が移行元候補）
   - [ ] 少量なら `/ip/master` のCSV一括インポート（`電話番号,裏番号,会社名,ステータス,備考`）が使える

3. **実CDRファイルでの検証**
   - [ ] 実ファイルを `/import` から取込し、金額・分類・名寄せを目視検証
   - [ ] 未紐付け番号は「未照合一覧」（`/ip/unmatched`）に保存される。取引先を割り当てると番号マスタへの自動登録＋該当月への金額反映まで行われる
   - [ ] H列に想定外の通話種別名称があれば取込結果に「未対応の通話種別」として警告表示される → 必要なら `src/lib/ip-billing.ts` の `classifyCallType` に追加

4. **旧テーブル削除（移行完了後）**
   - 削除前にデータ確認（Mac / プロジェクトルート）：
     ```bash
     node -e "const db=require('better-sqlite3')('lime.db');['billing_accounts','channel_groups','phone_numbers','tenant_assignments','tenant_packs','monthly_usages','call_logs','packs'].forEach(t=>{try{console.log(t+': '+db.prepare('SELECT COUNT(*) c FROM '+t).get().c+'件')}catch(e){console.log(t+': テーブルなし')}})"
     ```
   - [ ] 移行完了後、上記8テーブルをDROP（マイグレーション0009として追加）
   - [ ] 併せて `src/lib/db/schema.ts` に残る旧4テーブル定義（`billingAccounts` / `channelGroups` / `phoneNumbers` / `tenantAssignments`、「Phase E後に削除」コメント付き）と、`src/app/(dashboard)/tenants/actions.ts` 内の旧テーブル削除フォールバック、`src/lib/db/migrate-ad1-sheet.ts` / `link-channel-groups.ts` を削除

5. **その他**
   - [ ] 本番デプロイ時のSFコールバックURL追加（既存タスク → `TASKS.md` DEPLOY-01）
   - [ ] `scripts/seed-billing-items.js` のlintエラー3件（既存。急ぎではない）

---

## 5. 動作確認のしかた

認証があるためブラウザ経由が基本：

1. `/ip/master` で取引先に番号（＋裏番号）を登録
2. `/import` でCDR CSVをアップロード（複数可・利用月はファイルから自動判定）
3. 取込結果カードで「取込件数 / 未紐付け番号 / 未対応通話種別」を確認
4. `/ip/billing/該当月` で固定分・携帯＋ナビ分・合計を確認 → SF送信
5. `/ip/numbers` で番号ごとの内訳（展開表示）を確認

ロジック単体の検証は `src/lib/cdr-import.ts` の `importCdrFile(buffer, fileName)` を一時DB（`DATABASE_URL`切替）で直接叩く方法が使えます（`server-only` 対策として `NODE_OPTIONS="--conditions=react-server" npx tsx <script>` で実行。今回の検証もこの方法で、期待値：100秒固定=6円 / 200秒携帯+60秒ナビ+O列100円=1172円 などを確認済み）。

---

## 6. ハマりどころ・設計メモ

- **本番はCloud Run（`line-management-168668335532.asia-northeast1.run.app`）で、mainへのpushでデプロイされる**。コンテナ起動時に `scripts/migrate-on-start.mjs` が未適用マイグレーションを自動適用する（journal未管理の既存DBは0007までベースライン登録してから差分適用。失敗してもサーバー起動は妨げない — Cloud Runのログを確認）
- **`npm run db:migrate` はdevサーバーを止めてから実行する**：migrateスクリプトはDBをWALモードで開くが、アプリはDELETEモードで開くため、同時に動かすと `SQLITE_BUSY: database is locked` が発生する。発生してしまったら、サーバーを止めて `node -e "require('better-sqlite3')('lime.db').pragma('journal_mode = DELETE')"` でWALを解除してから再起動する。
- **CDRの文字コード**：Shift-JIS前提。ただしUTF-8として完全に妥当なファイルはUTF-8として読む（`decodeCdrBuffer`）。
- **列マッピング**はA〜Oの15列固定（0始まりで A=0請求アカウント, C=2請求月, D=3利用月, F=5ご利用番号, H=7通話種別名称, N=13通話時間, O=14通話料金）。列構成が変わる場合は `src/lib/cdr-import.ts` の `COL` を修正。
- **「差分投入」の意味**：キャリアから届くファイル自体が差分（追加分のみ）である前提。累積ファイル（前回分を含む全量）を再投入すると二重計上になるので運用注意。全量やり直したい場合は該当月の `ip_usage_details` / `ip_usages` / `ip_import_files` を削除してから取込し直す。
- **SF送信**は金額が0円の商品はラインアイテムを作らない。両方0円なら送信エラー（「送信対象金額が0円」）になる。
- **`ip_usages.sf_status`** のenumには「対応不要」も定義済みだが、現状IP画面からは設定UIを出していない（携帯側と将来揃える余地として残置）。
