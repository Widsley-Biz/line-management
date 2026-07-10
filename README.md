# LineHub — IP・携帯回線 統合管理システム

IP回線・携帯回線の再販事業における通話料集計・請求管理・Salesforce連携を一元化する社内ツール。

> 2026年7月にIP回線管理を全面刷新（CDRベースのタリフ計算へ移行）。詳細は `docs/LineHub_IP回線改修_要件定義書.md` と引き継ぎ資料 `TASK.md` を参照。

## 技術スタック

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** + shadcn/ui
- **SQLite** (better-sqlite3) + **Drizzle ORM**
- **NextAuth.js v5** (Credentials)
- **jsforce** (Salesforce連携)

## セットアップ

```bash
npm install
# .env.local を作成（環境変数の項を参照）
npm run db:migrate            # マイグレーション適用
npm run db:seed               # DB初期化（ユーザー・デフォルトタリフ）
npm run dev                   # http://localhost:3000
```

初期ログイン: `ryuji.kawakami@widsley.com` / `Widsley2024!`

## データインポート

### IP回線データ（CDR通話明細）

インポート画面（`/import`）からCDR CSV（Shift-JIS / 複数ファイル可）をアップロード。

- 通話種別（H列）を4パターン（固定 / 携帯 / ナビ秒課金 / ナビ金額課金）に自動分類し、タリフ（`/ip/tariffs`）で通話料を自動計算
- 「ご利用番号」（F列）を番号マスタ（`/ip/master`）の**表番号 → 裏番号**の順で照合して取引先に名寄せ。未紐付け番号は取込結果に警告表示
- 同一内容ファイルはハッシュで自動スキップ。内容が異なるファイルは**差分として追記**され、取引先×利用月の金額が自動で再集計される
- 端数はSF商品単位で切り上げ（①固定分 / ②携帯＋ナビ分）。請求月は**利用月＋1ヶ月**

### 携帯回線データ

インポート画面（`/import`）からSoftBank Excel（.xlsx）またはCSV（.csv）をアップロード。ファイル形式は自動判別。

- 照合は**氏名（col[2]）→ 取引先名**で行う（回線マスタ不要）
- 照合できなかった行は未照合一覧（`/mobile/unmatched`）に登録され、後から取引先への紐付け・無視を選択できる

## データモデル

```
tenants (テナント)
  ├── ip_numbers (IP回線番号マスタ：表番号・裏番号)
  ├── ip_tariffs (タリフ設定：tenant_id NULL = デフォルト)
  ├── ip_usages (IP月次通話料：固定分・携帯＋ナビ分・合計)
  │     └── ip_usage_details (番号×通話種別の内訳)
  └── mobile_lines (携帯回線マスタ)
        └── mobile_usages (携帯月次使用量)
              └── mobile_usage_details (超過項目別明細)

ip_import_files (CDR取込履歴・ファイルハッシュによる重複判定)
```

※ 旧IP回線構造（`billing_accounts` / `channel_groups` / `phone_numbers` / `tenant_assignments`）は初期データ移行（Phase E）完了後に削除予定。`TASK.md` 参照。

## テナント管理

- `slug` はSF商談IDを自動使用（例：`006Q900001aE5U2IAK`）
- SF商談IDは必須項目（Salesforce連携に使用）
- CSV一括登録対応（フォーマット：`会社名,SF商談ID,MFパートナーID,備考`）

## 主要画面

| パス | 画面 |
|------|------|
| `/` | ダッシュボード（IP・携帯タブ切り替え） |
| `/tenants` | 取引先一覧・詳細（CSV一括登録対応） |
| `/import` | CSV/Excelインポート（CDR＝IP回線・SoftBank＝携帯回線）※SoftBank取込時に課金項目確認ダイアログ表示 |
| `/activity` | 更新履歴 |
| `/settings` | ユーザー管理・SF接続設定の確認 |
| `/ip/master` | IP回線マスタ（表番号・裏番号、CSV一括登録） |
| `/ip/billing/[yearMonth]` | IP回線 月次請求管理（固定分・携帯＋ナビ分、一括/選択/個別SF送信、CSVエクスポート） |
| `/ip/numbers` | 契約番号一覧（番号・裏番号・通話種別内訳、CSVエクスポート） |
| `/ip/tariffs` | タリフ設定（デフォルト4種の編集・取引先別上書き） |
| `/mobile/master` | 携帯回線マスタ（CSV一括登録・端末回収管理） |
| `/mobile/billing/[yearMonth]` | 携帯回線 月次請求管理 |
| `/mobile/devices` | 契約端末一覧（契約期間・端末回収フィルター） |
| `/mobile/billing-items` | 課金項目マスタ（課金/非課金管理・CSVから一括取込） |
| `/mobile/sf-pending` | SF未送信一覧（全月横断・キーワード絞込・一括「対応不要」） |
| `/mobile/unmatched` | SoftBank取込 未照合一覧（取引先への紐付け・無視） |

## npm scripts

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | プロダクションビルド |
| `npm run db:seed` | DB初期化 |
| `npm run db:generate` | Drizzleマイグレーション生成 |
| `npm run db:migrate` | マイグレーション適用 |
| `npm run db:studio` | Drizzle Studio（DBブラウザ）起動 |
| `npm run db:migrate-ad1` | （旧構造）AD1シートCSVインポート ※Phase E移行元データ用 |
| `npm run db:link-groups` | （旧構造）チャンネルグループ自動リンク ※Phase E移行元データ用 |

## 環境変数

`.env.local` を作成する。

```
# 認証（必須）
AUTH_SECRET=your-secret              # openssl rand -base64 32 で生成
NEXTAUTH_URL=http://localhost:3000

# データベース（任意・デフォルト lime.db）
DATABASE_URL=lime.db

# Salesforce連携（OAuth / Connected App）
SF_LOGIN_URL=https://login.salesforce.com
SF_CLIENT_ID=...
SF_CLIENT_SECRET=...
SF_INSTANCE_URL=https://login.salesforce.com

# Salesforce送信（価格表・商品）
SF_PRICEBOOK2_ID=...                 # 商談にセットする価格表
SF_PRICEBOOK_ENTRY_ID_CC01=...       # IP回線通話料_国内固定番号宛（CC_01）
SF_PRICEBOOK_ENTRY_ID_CC02=...       # IP回線通話料_国内携帯番号宛（CC_02）
SF_PRICEBOOK_ENTRY_ID_MOBILE=...     # 携帯回線超過分

# 商談リンク表示（任意）
NEXT_PUBLIC_SF_ORG_URL=https://xxx.lightning.force.com
```

SF_* はSalesforce送信機能を使う場合のみ必要。未設定でもその他の機能はローカルで動作する。

## Docker

```bash
docker build -t linehub .
docker run -p 3000:3000 -v linehub-data:/data linehub
```