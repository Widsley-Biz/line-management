# PRD: IP回線・携帯回線 統合管理システム（LineHub）

**更新日：** 2026年5月8日

## 1. 背景・目的

### 1.1 背景

現在、IP回線・携帯回線の再販事業においてスプレッドシートで以下を管理している。

- アジャストワン社から調達したIP回線契約（原価）
- 各テナント（顧客企業）への回線・チャンネル・電話番号の割り当て
- テナントごとの請求ルールに基づく請求額の確認・差分チェック
- SoftBankから受領する携帯回線の利用料超過代金の集計・Salesforce登録

スプレッドシート管理では以下の課題がある。

- 請求漏れ・過剰請求の検知が属人的・手作業
- 複数担当者が同時編集するとデータ整合性が壊れやすい
- 請求状況のサマリー・可視化が困難
- 携帯回線の超過代金集計・Salesforce登録が手動で工数がかかる

### 1.2 目的

IP回線・携帯回線の**原価（調達コスト）と売上（テナントへの請求）を一元管理**し、請求差分の自動検知・可視化・Salesforce自動登録ができるシステムを構築する。

---

## 2. スコープ

### Phase 1（完了）: IP回線管理

- 請求アカウント・チャンネルグループ・電話番号の管理
- テナントへの割り当て管理・パック管理・超過料金計算
- 月次通話データCSVインポート（AdjustOne / ProDelight）
- Salesforce連携（超過料金のOpportunityLineItem登録）

### Phase 2（完了）: 携帯回線管理

- SoftBank Excel/CSV（自動判別）インポート・超過代金集計
- 携帯回線マスタ管理（電話番号↔テナント紐付け・端末回収管理）
- 月次請求管理・Salesforce一括送信
- 統合ダッシュボード

---

## 3. ユーザー・ステークホルダー

| ロール | 主な操作 |
|--------|----------|
| 管理者（Admin） | 全機能。マスタ管理・一括操作 |
| メンバー | 請求確認・インポート・Salesforce送信 |

---

## 4. テナント管理仕様

### slug

- SF商談IDを自動使用（例：`006Q900001aE5U2IAK`）
- URLの `/Opportunity/〇〇/view` の〇〇部分（18桁CaseSafeID）
- 手動登録・CSV一括登録ともに共通ルール

### CSV一括登録

```
会社名,SF商談ID,MFパートナーID,備考
株式会社サンプル,006Q900001aE5U2IAK,,
```

- 会社名・SF商談IDは必須
- SF商談ID重複時はスキップ

---

## 5. 機能要件

### 5.1 IP回線管理

（Phase 1より変更なし）

### 5.2 携帯回線管理

#### 5.2.1 SoftBankファイルインポート

- 対応形式：.xlsx / .csv（拡張子で自動判別）
- 対象：全社分まとめた1ファイル
- ヘッダー行：1行目=項目名、2行目=税区分、3行目からデータ
- 15種の超過項目を自動集計し、テナントごとに合算

#### 5.2.2 回線マスタ管理

| 機能 | 内容 |
|---|---|
| 個別登録 | フォームから1件ずつ登録 |
| CSV一括登録 | CSVファイルで複数件一括登録（テンプレートダウンロード付き） |
| 編集・削除 | 各行の鉛筆アイコンから編集 |
| 端末回収管理 | 未回収 / 回収済 / 回収不要 の3択で管理 |

**CSVフォーマット：**
```
電話番号,会社名,ステータス,契約開始日,解約日,備考
090-1234-5678,株式会社サンプル,契約中,2024-01-01,,
```

#### 5.2.3 契約端末一覧（`/mobile/devices`）

| 機能 | 内容 |
|---|---|
| 月ナビゲーション | 右上に `< 年月 >` 形式で配置 |
| 契約期間表示 | 契約開始日・終了日列（終了日入力済みはアンバー色強調） |
| 端末回収表示 | 未回収 / 回収済 / 回収不要 のバッジ表示 |
| 回収フィルター | すべて / 未回収のみ / 回収済のみ / 回収不要のみ |

#### 5.2.4 Salesforce連携

| フィールド | 値 |
|---|---|
| 商品コード | `CMP_OP_09`（固定） |
| 商品名 | `携帯_利用料超過代金`（固定） |
| 販売価格 | 超過分合計金額 |
| 数量 | `1`（固定） |
| 請求開始日 | 利用月+2ヶ月の1日 |
| 請求終了日 | 利用月+2ヶ月の末日 |
| 商談 | `tenants.sfOpportunityId` |

### 5.3 ダッシュボード

**上部カード（常時表示）**
- 有効テナント：全契約中テナント数
- SF送信待ち：IP回線 + 携帯回線の合計件数（内訳も表示）

**IP回線タブ**
- 使用量入力済みカード
- 粗利概算カード
- SF送信待ち一覧
- 請求アカウントch状況

**携帯回線タブ**
- SF送信待ち一覧
- 携帯回線契約状況

---

## 6. DBスキーマ（携帯回線関連）

```
mobile_lines (携帯回線マスタ)
  id, tenant_id, phone_number, status,
  contract_start, contract_end,
  device_returned,  -- 0:未回収 / 1:回収済 / 2:回収不要
  notes, created_at, updated_at

mobile_usages (携帯月次使用量)
  id, tenant_id, year_month, total_lines,
  overage_total, sf_status, sf_sent_at,
  sf_error_message, imported_at, created_at, updated_at

mobile_usage_details (超過項目別明細)
  id, mobile_usage_id, tenant_id, phone_number,
  item_name, amount, year_month, created_at
```

---

## 7. 非機能要件

| 項目 | 要件 |
|------|------|
| 認証 | メール + パスワードログイン（NextAuth.js） |
| データ保護 | SQLiteファイルの定期バックアップ |
| レスポンス | 一覧ページ：2秒以内 |
| 対応ブラウザ | Chrome最新版（社内利用） |
| モバイル対応 | 不要（PC利用前提） |

---

## 8. 技術スタック

| 項目 | 技術 |
|------|------|
| フレームワーク | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| DB | SQLite (better-sqlite3) + Drizzle ORM |
| 認証 | NextAuth.js v5 |
| SF連携 | jsforce |
| Excelパース | exceljs |
| デプロイ | Docker → AWS (EC2/ECS) |
| CI/CD | GitHub Actions |

---

## 9. 画面一覧

| 画面 | パス |
|------|------|
| ダッシュボード | / |
| 請求アカウント一覧 | /billing-accounts |
| 請求アカウント詳細 | /billing-accounts/[id] |
| テナント一覧 | /tenants |
| テナント詳細 | /tenants/[id] |
| テナント新規登録 | /tenants/new |
| 請求管理（IP） | /billing/[yearMonth] |
| 請求詳細（IP） | /billing/[yearMonth]/[tenantId] |
| ユニットch管理 | /unit-ch |
| インポート | /import |
| 更新履歴 | /activity |
| 設定 | /settings |
| 携帯回線マスタ | /mobile/master |
| 携帯回線 月次請求 | /mobile/billing/[yearMonth] |
| 契約端末一覧 | /mobile/devices |