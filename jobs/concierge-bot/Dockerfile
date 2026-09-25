# Playwright公式イメージ。ブラウザと依存ライブラリが入っている。
# タグの版は package.json の playwright と必ず揃えること（ずれるとブラウザが起動しない）。
FROM mcr.microsoft.com/playwright:v1.56.0-jammy

WORKDIR /app

# lock ファイルごと入れて npm ci で固定する（毎回同じものが入るようにするため）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.mjs site.mjs ./

# このプロセスはDBに触らない（docs/CONCIERGE_SYNC.md INV-1）。
# 取得結果は CALLBACK_URL へHTTPで返す。
# Cloud Run Job はこのコマンドを1回実行して終了する。
CMD ["node", "index.mjs"]
