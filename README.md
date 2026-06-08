# LineHub — IP・携帯回線 統合管理システム

IP回線の再販事業における請求管理・ch割り当て・Salesforce連携を一元化する社内ツール。

## 技術スタック

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** + shadcn/ui
- **SQLite** (better-sqlite3) + **Drizzle ORM**
- **NextAuth.js v5** (Credentials)
- **jsforce** (Salesforce連携)

## セットアップ

```bash
npm install
cp .env.example .env.local   # 環境変数を設定
npm run db:seed               # DB初期化（ユーザー・パックマスタ）
npm run dev                   # http://localhost:3000
```

初期ログイン: `ryuji.kawakami@widsley.com` / `Widsley2024!`

## データインポート

### IP回線データ

```bash
# 1. AD1シートCSV → 請求アカウント・チャンネルグループ・電話番号
npm run db:migrate-ad1

# 2. SF顧客CSV → テナント・パック設定
npm run db:migrate-sf-customers

# 3. チャンネルグループ → テナント自動リンク
npm run db:link-groups
```

### 携帯回線データ

インポート画面（`/import`）からSoftBank Excel（.xlsx）またはCSV（.csv）をアップロード。ファイル形式は自動判別。

- 照合は**氏名（col[2]）→ 取引先名**で行う（回線マスタ不要）
- 照合できなかった行は未照合一覧（`/mobile/unmatched`）に登録され、後から取引先への紐付け・無視を選択できる

## データモデル

```
billing_accounts (請求アカウント)
  └── channel_groups (チャンネルグループ)
        └── phone_numbers (電話番号)

tenants (テナント)
  ├── tenant_assignments → phone_numbers
  ├── tenant_packs → packs
  ├── monthly_usages
  ├── call_logs
  └── mobile_lines (携帯回線マスタ)
        └── mobile_usages (携帯月次使用量)
              └── mobile_usage_details (超過項目別明細)
```

## テナント管理

- `slug` はSF商談IDを自動使用（例：`006Q900001aE5U2IAK`）
- SF商談IDは必須項目（Salesforce連携に使用）
- CSV一括登録対応（フォーマット：`会社名,SF商談ID,MFパートナーID,備考`）

## 主要画面

| パス | 画面 |
|------|------|
| `/` | ダッシュボード（IP・携帯タブ切り替え） |
| `/billing-accounts` | 請求アカウント一覧・詳細 |
| `/tenants` | 取引先一覧・詳細（CSV一括登録対応） |
| `/billing` | 月次請求管理（IP回線） |
| `/unit-ch` | ユニットch管理 |
| `/import` | CSV/Excelインポート（IP回線・携帯回線）※SoftBank取込時に課金項目確認ダイアログ表示 |
| `/activity` | 更新履歴 |
| `/settings` | ユーザー管理 |
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
| `npm run db:migrate-ad1` | AD1シートCSVインポート |
| `npm run db:migrate-sf-customers` | SF顧客CSVインポート |
| `npm run db:link-groups` | チャンネルグループ自動リンク |

## 環境変数

`.env.example` をコピーして `.env.local` を作成する。

```
# 認証（必須）
NEXTAUTH_SECRET=your-secret          # openssl rand -base64 32 で生成
NEXTAUTH_URL=http://localhost:3000

# データベース（任意・デフォルト lime.db）
DATABASE_URL=lime.db

# Salesforce連携（IP回線：Username-Password Flow）
SF_LOGIN_URL=https://login.salesforce.com
SF_USERNAME=...
SF_PASSWORD=...
SF_SECURITY_TOKEN=...
SF_PRODUCT2_ID_CC01=...
SF_PRODUCT2_ID_CC02=...
SF_PRICEBOOK2_ID=...

# Salesforce連携（携帯回線：Client Credentials Flow）
SF_CLIENT_ID=...
SF_CLIENT_SECRET=...
SF_INSTANCE_URL=https://login.salesforce.com
SF_PRICEBOOK_ENTRY_ID_MOBILE=...
```

SF_* はSalesforce送信機能を使う場合のみ必要。未設定でもその他の機能はローカルで動作する。

## Docker

```bash
docker build -t linehub .
docker run -p 3000:3000 -v linehub-data:/data linehub
```