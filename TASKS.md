# 次期タスク一覧

**最終更新：** 2026年6月17日

---

## 実装待ちタスク

### BUG-08：SF商談IDリンクが請求管理ページに表示されない
- **優先度：** 中
- **概要：** `NEXT_PUBLIC_SF_ORG_URL` を `.env.local` に設定してもSF商談IDリンクが請求管理一覧・詳細ページに表示されない
- **調査ポイント：**
  - `billing-table.tsx`（クライアントコンポーネント）で `process.env.NEXT_PUBLIC_SF_ORG_URL` が正しく参照できているか確認
  - env未設定時のフォールバック（グレーテキスト表示）も出ていないか確認 → 出ていない場合はクエリ or 型定義の問題
  - dev サーバー再起動後に再確認
- **対象ファイル：**
  - `src/components/billing-table.tsx`
  - `src/app/(dashboard)/billing/[yearMonth]/page.tsx`
  - `src/app/(dashboard)/billing/[yearMonth]/[tenantId]/page.tsx`

### FEAT-04：ユーザー毎のSF接続ロジック構築
- **優先度：** 高
- **概要：** 現在はシステム共通のSFシステム管理者アカウント（client_credentials）でSF更新しているが、このシステムのログインユーザーに紐づくSFユーザーで商談を更新できる仕組みを構築する

---

#### 【情シス対応】Salesforce Connected App の設定変更

このシステムからSF送信する際に特定のSFユーザーとして更新するには、  
現在の Connected App に `refresh_token` スコープの追加とコールバックURLの登録が必要です。

**手順：**

1. SalesforceにシステムA管理者でログイン
2. 右上の歯車 → **設定（Setup）**
3. 左の検索に `App Manager` と入力 → **App Manager** を開く
4. 現在使用している Connected App（`SF_CLIENT_ID` に対応するもの）の行右端 **▼ → 編集**
5. 「OAuth 設定」セクションで以下を追加：

   | 項目 | 設定値 |
   |---|---|
   | 追加スコープ① | `データへのアクセスおよび管理 (api)` |
   | 追加スコープ② | **`いつでもリクエストを実行 (refresh_token, offline_access)`** ← 必須 |
   | 追加スコープ③ | `OpenID Connect の基本情報へのアクセス (openid)` |
   | コールバック URL | `https://[本番ドメイン]/api/auth/sf/callback` を追加 |

6. 保存（反映まで最大10分）
7. App Manager → Connected App の **「管理」** → 「OAuth ポリシー」を確認：

   | 項目 | 推奨設定 |
   |---|---|
   | 許可されているユーザー | `管理者が承認したユーザーは事前承認済み` または `全ユーザーが自己承認可能` |
   | リフレッシュトークンポリシー | `リフレッシュトークンは失効まで有効` |

8. 設定完了後、以下を開発側に共有：
   - 変更した Connected App の `クライアントID（Consumer Key）`
   - `クライアントシークレット（Consumer Secret）`
   - 本番ドメイン（コールバックURL登録に使用したもの）

> **確認事項：** 現在の Connected App が `client_credentials` 専用の場合、  
> 「コールバック URL」欄が存在しないことがあります。その場合は新規 Connected App を作成してください。

---

#### 【開発側対応】実装内容

情シスの設定完了後に着手：

1. **このシステムのログイン機能の有効化**
   - NextAuth.js はコード実装済み（`src/lib/auth.ts`）
   - ミドルウェアによる認証必須化と、ログイン画面UIの整備

2. **DB変更：usersテーブルにSFトークン保存カラムを追加**
   ```sql
   sf_user_id          TEXT  -- SFのUser ID（18桁）
   sf_access_token     TEXT  -- アクセストークン（暗号化）
   sf_refresh_token    TEXT  -- リフレッシュトークン（暗号化）★
   sf_token_expires_at TEXT  -- アクセストークン有効期限
   sf_instance_url     TEXT  -- 接続先SF URL
   ```

3. **設定画面にSF連携ボタンを追加**
   - SF OAuth画面にリダイレクト → 認証後 `/api/auth/sf/callback` でトークン取得・DB保存

4. **SF送信ロジックの変更**（`src/app/api/mobile/send-sf/route.ts` 等）
   - `getSFConnection()` をセッションユーザーのトークンを使う形に変更
   - トークン期限切れ時はrefresh_tokenで自動更新

---

## 次回検討事項

### 回線マスタの仕様検討
- **背景：** 現状、電話番号は請求CSVから取り込む都度参照しており、DBに電話番号一覧を持っていない
- **検討論点：**
  - システム内DBに電話番号一覧（回線マスタ）を保持するか否か
  - 保持する場合：契約情報（取引先・契約日・解約日等）との紐付け設計
  - 保持しない場合：請求CSVベースで動作する現行方式のまま進め、SF連携で補完
- **優先度：** 次回MTGで方針確定後、実装着手

---

## 完了タスク

- ✅ テナント → 取引先（名称変更）
- ✅ スラッグ → 取引先コード（名称変更）
- ✅ 契約端末一覧のヘッダーカード追加（取引先数・契約電話番号数・超過料金、検索連動）
- ✅ BUG-01：MonthPicker を `defaultValue` → `value` に変更（＜＞ナビで月表示が更新されない問題）
- ✅ BUG-02：取引先新規登録後のリダイレクト先を `/tenants` に変更
- ✅ 取引先削除機能：一覧からゴミ箱アイコン→確認ダイアログ→関連データ含めカスケード削除
- ✅ FEAT-01：CSV課金項目マスタ管理（`mobile_billing_items` テーブル・名前マッチング・管理画面 `/mobile/billing-items`）
- ✅ FEAT-01a：SoftBankインポート確認ダイアログ（課金項目一覧プレビュー・未登録項目の課金区分選択・ヘッダー1行目のみスキャン）
- ✅ FEAT-01b：課金項目マスタへのCSV一括取込（ヘッダー1行目読込・既登録項目スキップ・未登録項目ごとに課金/非課金/取り込まない選択）
- ✅ FEAT-02：500円未満請求の管理（「500円未満」タブ・対応不要ステータス更新・一括送信前確認ダイアログ）
- ✅ BUG-03：取引先新規登録時のSF商談ID重複エラーをユーザー向けメッセージで表示
- ✅ BUG-04：課金項目マスタページの JSON パースエラー（`mobile_billing_items` migration 未適用）を修正
- ✅ BUG-05：サイドバー Tooltip の hydration mismatch を修正（Tooltip を削除し Link に統一）
- ✅ FEAT-03：SF未送信一覧ページ（`/mobile/sf-pending`）実装 — 全月横断・月別グループ・SF連携なし判定・在庫/社内/デモ等キーワード絞込・一括「対応不要」・個別SF送信
- ✅ FEAT-CSV：SoftBank取込を氏名→取引先名照合に変更・未照合一覧ページ（`/mobile/unmatched`）追加
- ✅ BUG-06：マイグレーション 0003・0004 が `meta/_journal.json` 未登録で `db:migrate` にスキップされる問題を修正（`no such table: mobile_import_unmatched` エラーの原因）
- ✅ DOCS：README・prd.md を実装の最新状態に同期（`/mobile/sf-pending`・`/mobile/unmatched` 追記、環境変数の完全化、`.env.example` 追加）
- ✅ BUG-07：インポートモーダルの課金項目表示とマスタ一覧の不一致修正（`continuousImport` フィルター除去・プレビュー時データ行スキャンで未検出項目を補完）
- ✅ VERIFY-01：SoftBank CSV取込ロジック変更（氏名→取引先名照合）の検証完了 — 複数月の実データで照合・mobileUsages/mobileUsageDetails 正常生成確認済み
- ✅ FEAT-05：SF商談IDリンク実装（取引先詳細・請求管理一覧・請求詳細・SF未送信一覧）— `NEXT_PUBLIC_SF_ORG_URL` 設定時はリンク、未設定時はテキスト表示
