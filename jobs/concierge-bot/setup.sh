#!/usr/bin/env bash
#
# concierge-bot を本番で動かせるようにする一式。
#
#   ./setup.sh secrets   … 認証情報を Secret Manager に登録する（対話入力）
#   ./setup.sh deploy    … イメージをビルドして Cloud Run Job を作る／更新する
#   ./setup.sh wire      … 本体サービスに設定を入れ、Jobを起動できる権限を与える
#   ./setup.sh schedule  … 毎朝8時の Cloud Scheduler を作る
#   ./setup.sh status    … 今どこまでできているか確認する
#   ./setup.sh run       … 手動で1回実行してみる
#
# 何度実行しても同じ結果になるように書いてある（既にあるものは作り直さない）。
#
set -euo pipefail

PROJECT="${PROJECT:-widsley-dx}"
REGION="${REGION:-asia-northeast1}"
JOB="concierge-bot"
SERVICE="line-management"
IMAGE="gcr.io/${PROJECT}/${JOB}"
LOGIN_URL="https://portal.business.mb.softbank.jp/portal/BPS0001/index"

# Job 専用のサービスアカウント。
# INV-1（DBに書くのは本体サービスだけ）をIAMでも担保するため、
# 本体とは別にして権限を一切付けない。
JOB_SA="concierge-bot@${PROJECT}.iam.gserviceaccount.com"

say() { printf "\n\033[1m%s\033[0m\n" "$*"; }
ok()  { printf "  ✓ %s\n" "$*"; }

ensure_secret() {
  local name="$1" prompt="$2"
  if gcloud secrets describe "$name" --project "$PROJECT" >/dev/null 2>&1; then
    ok "$name はすでにあります（値を変えるなら --add-version で更新してください）"
    return
  fi
  say "$prompt"
  echo "  入力は画面に表示されません。入力後 Enter を押してください。"
  local value
  read -rs value
  echo
  printf '%s' "$value" | gcloud secrets create "$name" \
    --project "$PROJECT" --replication-policy=automatic --data-file=- >/dev/null
  unset value
  ok "$name を登録しました"
}

cmd_secrets() {
  say "1. 認証情報を Secret Manager に登録します"
  gcloud services enable secretmanager.googleapis.com --project "$PROJECT" >/dev/null
  ensure_secret sb-concierge-id       "SB法人コンシェルの管理者IDを入力してください"
  ensure_secret sb-concierge-password "SB法人コンシェルのパスワードを入力してください"

  # Scheduler からの起動を認証するトークン。人間が覚える必要はないので自動生成する
  if ! gcloud secrets describe scheduler-token --project "$PROJECT" >/dev/null 2>&1; then
    openssl rand -hex 32 | tr -d '\n' | gcloud secrets create scheduler-token \
      --project "$PROJECT" --replication-policy=automatic --data-file=- >/dev/null
    ok "scheduler-token を自動生成して登録しました"
  else
    ok "scheduler-token はすでにあります"
  fi
}

cmd_deploy() {
  say "2. イメージをビルドして Cloud Run Job を作ります"

  if ! gcloud iam service-accounts describe "$JOB_SA" --project "$PROJECT" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$JOB" \
      --project "$PROJECT" \
      --display-name "concierge-bot (スクレイピング専用・DB権限なし)" >/dev/null
    ok "Job専用のサービスアカウントを作りました"
  else
    ok "Job専用のサービスアカウントはすでにあります"
  fi

  # 秘密を読める権限だけ与える。DB(GCS)には触らせない
  for s in sb-concierge-id sb-concierge-password; do
    gcloud secrets add-iam-policy-binding "$s" \
      --project "$PROJECT" \
      --member "serviceAccount:${JOB_SA}" \
      --role roles/secretmanager.secretAccessor >/dev/null
  done
  ok "Secret の読み取り権限を付けました"

  say "  イメージをビルドしています（数分かかります）"
  gcloud builds submit --project "$PROJECT" --tag "$IMAGE" .

  local verb=create
  gcloud run jobs describe "$JOB" --region "$REGION" --project "$PROJECT" >/dev/null 2>&1 && verb=update

  gcloud run jobs "$verb" "$JOB" \
    --project "$PROJECT" \
    --region "$REGION" \
    --image "$IMAGE" \
    --service-account "$JOB_SA" \
    --memory 2Gi \
    --cpu 1 \
    --task-timeout 30m \
    --max-retries 0 \
    --parallelism 1 \
    --set-env-vars "SB_CONCIERGE_LOGIN_URL=${LOGIN_URL}" \
    --set-secrets "SB_CONCIERGE_ID=sb-concierge-id:latest,SB_CONCIERGE_PASSWORD=sb-concierge-password:latest"
  ok "Cloud Run Job を ${verb} しました"
  echo "     メモリ2Gi（Chromiumは512MiBでは動かない）/ リトライ0 / DBはマウントしない"
}

cmd_wire() {
  say "3. 本体サービスから Job を起動できるようにします"

  local url sa
  url=$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" \
        --format 'value(status.url)')
  sa=$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" \
        --format 'value(spec.template.spec.serviceAccountName)')
  [ -n "$sa" ] || sa="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
  ok "本体URL: $url"
  ok "本体のサービスアカウント: $sa"

  gcloud run jobs add-iam-policy-binding "$JOB" \
    --project "$PROJECT" --region "$REGION" \
    --member "serviceAccount:${sa}" \
    --role roles/run.invoker >/dev/null
  ok "本体に Job 起動の権限を付けました"

  gcloud secrets add-iam-policy-binding scheduler-token \
    --project "$PROJECT" \
    --member "serviceAccount:${sa}" \
    --role roles/secretmanager.secretAccessor >/dev/null

  gcloud run services update "$SERVICE" \
    --project "$PROJECT" --region "$REGION" \
    --update-env-vars "CONCIERGE_JOB_NAME=${JOB},CONCIERGE_JOB_REGION=${REGION},APP_BASE_URL=${url}" \
    --update-secrets "SCHEDULER_TOKEN=scheduler-token:latest" >/dev/null
  ok "本体に CONCIERGE_JOB_NAME / CONCIERGE_JOB_REGION / APP_BASE_URL / SCHEDULER_TOKEN を設定しました"
}

cmd_schedule() {
  say "4. 毎朝8時の自動実行を作ります"
  gcloud services enable cloudscheduler.googleapis.com --project "$PROJECT" >/dev/null

  local url token
  url=$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" \
        --format 'value(status.url)')
  token=$(gcloud secrets versions access latest --secret scheduler-token --project "$PROJECT")

  local verb=create
  gcloud scheduler jobs describe concierge-daily --location "$REGION" --project "$PROJECT" >/dev/null 2>&1 && verb=update

  gcloud scheduler jobs "$verb" http concierge-daily \
    --project "$PROJECT" \
    --location "$REGION" \
    --schedule "0 8 * * *" \
    --time-zone "Asia/Tokyo" \
    --uri "${url}/api/concierge/sync" \
    --http-method POST \
    --headers "x-scheduler-token=${token}" \
    --attempt-deadline 60s >/dev/null
  unset token
  ok "毎朝8時（日本時間）に ${url}/api/concierge/sync を叩くようにしました"
}

cmd_status() {
  say "いまの状態"
  for s in sb-concierge-id sb-concierge-password scheduler-token; do
    if gcloud secrets describe "$s" --project "$PROJECT" >/dev/null 2>&1; then ok "Secret $s あり"; else echo "  × Secret $s なし"; fi
  done
  if gcloud run jobs describe "$JOB" --region "$REGION" --project "$PROJECT" >/dev/null 2>&1; then
    ok "Cloud Run Job $JOB あり"
  else echo "  × Cloud Run Job $JOB なし"; fi
  if gcloud scheduler jobs describe concierge-daily --location "$REGION" --project "$PROJECT" >/dev/null 2>&1; then
    ok "Scheduler concierge-daily あり"
  else echo "  × Scheduler concierge-daily なし"; fi
}

cmd_run() {
  say "手動で1回実行します（本体のAPI経由。実行履歴に残ります）"
  local url token
  url=$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format 'value(status.url)')
  token=$(gcloud secrets versions access latest --secret scheduler-token --project "$PROJECT")
  curl -sS -X POST "${url}/api/concierge/sync" -H "x-scheduler-token: ${token}"
  unset token
  echo
  echo "  画面（携帯回線 → コンシェル同期）で実行履歴を確認してください"
}

case "${1:-}" in
  secrets)  cmd_secrets ;;
  deploy)   cmd_deploy ;;
  wire)     cmd_wire ;;
  schedule) cmd_schedule ;;
  status)   cmd_status ;;
  run)      cmd_run ;;
  all)      cmd_secrets; cmd_deploy; cmd_wire; cmd_schedule; cmd_status ;;
  *)
    sed -n '3,15p' "$0"
    exit 1 ;;
esac
