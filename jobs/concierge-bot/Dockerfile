# Playwright公式イメージ。ブラウザと依存ライブラリが入っている
FROM mcr.microsoft.com/playwright:v1.56.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.mjs site.mjs ./

# Cloud Run Job はこのコマンドを1回実行して終了する
CMD ["node", "index.mjs"]
