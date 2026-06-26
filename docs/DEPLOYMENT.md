# LineHub 本番デプロイ記録 (GCP / Cloud Run)

> このドキュメントは 2026-06-25 に実施した本番デプロイ作業の記録と、残タスク・運用メモです。
> Claude Code で pull した際に、デプロイ済みの構成・設定値・残作業がここで把握できます。

## 1. 概要

LineHub (line-management) を GCP プロジェクト `widsley-dx` に **最小・低コスト構成** でデプロイしました。
同時利用ユーザーは 1〜2 名想定のため、Cloud Run + Cloud Storage 上の SQLite というシンプルな構成です。

| 項目 | 値 |
| --- | --- |
| GCP プロジェクト | `widsley-dx` |
| リージョン | `asia-northeast1` (東京) |
| Cloud Run サービス名 | `line-management` |
| サービス URL | https://line-management-168668335532.asia-northeast1.run.app |
| 現行リビジョン | `line-management-00006-xps` (トラフィック 100%) |
| デプロイ済みコミット | `eb4bbca` |
| デプロイ方式 | GitHub main への push → Cloud Build トリガーで自動ビルド/デプロイ |

## 2. アーキテクチャ

```
GitHub (main) --push--> Cloud Build (自動トリガー) --> Artifact Registry
                                                          |
                                                          v
                                                  Cloud Run (line-management)
                                                          |
                                  Cloud Storage バケット (FUSE マウント /data)
                                                          |
                                                  /data/lime.db (SQLite)
```

- DB は外部 DB ではなく **SQLite ファイル** (`/data/lime.db`)。
- Cloud Storage バケットを Cloud Run に FUSE マウントすることで永続化。

## 3. Cloud Run 設定 (現行リビジョン 00006-xps)

| 設定 | 値 | 備考 |
| --- | --- | --- |
| 最大インスタンス数 | **1** | SQLite の単一ライター制約のため必須。複数にすると DB 破損リスク |
| 最小インスタンス数 | 0 | コスト最小化 (アイドル時は課金されない) |
| CPU | 1 | |
| メモリ | 512 MiB | |
| ポート | 8080 | |
| 実行環境 | 第 2 世代 | FUSE マウントに必要 |
| 同時実行 | 80 | |

### ボリュームマウント
| 項目 | 値 |
| --- | --- |
| Cloud Storage バケット | `widsley-dx-linehub-data` |
| マウントパス | `/data` |
| アクセス | read-write |

コンピュート SA (`168668335532-compute@developer.gserviceaccount.com`) に `roles/storage.objectUser` を付与済み。

### 環境変数
| 名前 | 値 | 備考 |
| --- | --- | --- |
| `NEXTAUTH_URL` | https://line-management-168668335532.asia-northeast1.run.app | |
| `NEXTAUTH_SECRET` | (Cloud Run に設定済み・本書では非掲載) | base64 ランダム値 |
| `AUTH_TRUST_HOST` | `true` | Auth.js v5 を Cloud Run プロキシ背後で動かすため必須 |
| `DATABASE_URL` | `/data/lime.db` | Dockerfile の ENV で設定済み |

> `SF_*` (Salesforce 連携) はまだ未設定。Salesforce 送信機能を使う際に
> `gcloud run services update line-management --update-env-vars=SF_...` で追加が必要。

## 4. データベース (SQLite)

本番イメージ (standalone) は tsx / ソースを含まないためマイグレーションを実行できません。
そのため **Cloud Shell でローカルに migrate + seed したうえで lime.db をバケットへアップロード** しました。

```bash
git clone https://github.com/Widsley-Biz/line-management.git
cd line-management
npm ci
DATABASE_URL=./lime.db npm run db:migrate   # テーブル作成
DATABASE_URL=./lime.db npm run db:seed      # 初期データ投入
gcloud storage cp lime.db gs://widsley-dx-linehub-data/lime.db
```

投入された初期データ: ユーザー 7 名 / パック 5 件。
**初期パスワード: `Widsley2024!`** (運用開始後に各自変更すること)

### WAL → DELETE ジャーナルモード変更 (重要)
GCS-FUSE は SQLite の WAL モードを正しく扱えないため、ジャーナルモードを
`WAL` → `DELETE` に変更しました (`src/lib/db/index.ts`, コミット `eb4bbca`)。
最大インスタンス数 = 1 (単一ライター) のため DELETE モードでも問題ありません。

> **注意:** `src/lib/db/index.ts` の `journal_mode = DELETE` は本番 (GCS-FUSE) 必須設定です。
> ローカル開発で WAL に戻す場合も、本番デプロイ前には必ず DELETE に戻してください。

## 5. デプロイ手順 (今後の更新時)

コード修正は **main へ push するだけ** で Cloud Build が自動でビルド & デプロイします。

```bash
git add -A && git commit -m "..."
git push origin main
# → Cloud Build トリガーが発火 → 数分後に新リビジョンが 100% へ
```

ビルド状況: GCP Console → Cloud Build → 履歴。

## 6. 完了済みの作業 (2026-06-25)

- [x] GCP プロジェクト / API 有効化 / Cloud Build (GitHub 連携) 設定
- [x] Artifact Registry / 初回ビルド・デプロイ
- [x] Cloud Storage バケット `widsley-dx-linehub-data` 作成 (asia-northeast1)
- [x] Cloud Run へバケットを `/data` にマウント + SA への IAM 付与
- [x] 環境変数設定 (NEXTAUTH_URL / NEXTAUTH_SECRET / AUTH_TRUST_HOST)
- [x] 最大インスタンス数 1 / 最小 0 に設定
- [x] DB マイグレーション + シード → lime.db をバケットへアップロード
- [x] WAL → DELETE 修正 (コミット eb4bbca)
- [x] エンドツーエンドのログイン動作確認 (HTTP 302 + セッション Cookie 発行)

## 7. 残タスク

### 社長 (CEO) 対応が必要
- [ ] **Cloud Run の一般公開設定** … Claude には `run.services.setIamPolicy` 権限がないため未実施。
      Console → Cloud Run → line-management → セキュリティ/権限 → `allUsers` に
      `Cloud Run 起動元 (roles/run.invoker)` を付与。これで社内の誰でもアクセス可能になる。
      ※ 社内限定にしたい場合は IAP / 組織ドメイン制限を別途検討。

### 運用 / 任意
- [ ] 初期パスワード `Widsley2024!` を各ユーザーが変更
- [ ] Salesforce 送信機能を使う場合: `SF_*` 環境変数を Cloud Run に追加
      (`gcloud run services update line-management --update-env-vars=SF_LOGIN_URL=...,SF_USERNAME=...` 等)
- [ ] バケット `widsley-dx-linehub-data` の `lime.db` の定期バックアップ運用検討

## 8. 既知の制約 / 注意点

- **最大インスタンス数は必ず 1 のまま**にすること (SQLite 単一ライター制約)。スケールアウトすると DB が壊れる。
- DB は `/data/lime.db` (GCS-FUSE)。FUSE は同時書き込みに弱いため、上記インスタンス制約が前提。
- ジャーナルモードは `DELETE` 固定 (WAL は GCS-FUSE 非対応)。
- 本番イメージではマイグレーション不可。スキーマ変更時は Cloud Shell で migrate → lime.db を再アップロード、もしくは別途マイグレーション手段を用意する。


---

## 2026-06-26: Salesforce連携の修正記録

### 事象（修正前の不具合）

本番環境では、どのユーザーで「SF連携設定」を行っても、個人のOAuth認証画面を経ずに即時接続され、全員がシステム管理者アカウント（salesforce@widsley.com）としてSFに送信されてしまう問題があった。

### 原因

- mobile/send-sf と billing/send-sf のSF接続取得ロジックが「ユーザー個人のトークンを優先、なければシステム共通アカウントにフォールバック」する実装だった。ユーザーが未連携だと getSystemSFConnection()（client_credentials = システム管理者固定）に落ちるため、全員が同一アカウント扱いになっていた。
- さらに auth/sf/connect のPKCE用 sf_code_verifier クッキーが secure: false（localhost前提）のため、本番（HTTPS）でOAuthフローが正常に成立しにくかった。

### 修正内容（すべて main にコミット済）

- src/app/api/mobile/send-sf/route.ts: システム共通アカウントへのフォールバックを廃止。ユーザー個人のSF連携トークンがなければエラーを返す（commit 616e7e8）。
- src/app/api/billing/send-sf/route.ts: 同様のフォールバックを廃止（commit b568e72）。
- src/app/api/auth/sf/connect/route.ts: クッキーを secure: process.env.NODE_ENV === "production" に変更し、本番でOAuthフローが完了するように修正（commit 1d38511）。

### 修正後の振る舞い

- 各ユーザーが「SF連携設定」ボタンから個人のSalesforce OAuth連携を一度ずつ実施する必要がある（未連携のユーザーは送信時にエラーになる）。
- 送信は「そのユーザー本人のSFアカウント」として行われるようになる。

### 残タスク（要対応）

1. Cloud Run の環境変数追加（ユーザー作業）: SF_CLIENT_ID / SF_CLIENT_SECRET（Consumer Key/Secret、シークレットは本人が入力）、SF_INSTANCE_URL を Cloud Run の「変数とシークレット」に設定。
2. Salesforce External Client App のコールバックURLを本番へ変更済み: https://line-management-168668335532.asia-northeast1.run.app/api/auth/sf/callback
3. Cloud Run の一般公開（IAM）（社長作業）: allUsers + roles/run.invoker。「認証」タブで「公開アクセスを許可する」を選択（未対応）。
