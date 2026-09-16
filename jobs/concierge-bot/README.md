# concierge-bot

SB法人コンシェルから全回線を取得して本体（LineHub）に渡す Cloud Run Job。

## 役割の境界

このプロセスは **DBに一切触らない**（`docs/CONCIERGE_SYNC.md` INV-1）。
スクレイピングした結果を `POST /api/concierge/observed` に投げるだけで、
差分計算と台帳への反映は本体側が行う。

```
Cloud Scheduler ──► 本体 /api/concierge/sync ──► このJobを起動
                          ▲                            │
                          └──── /api/concierge/observed ◄┘
```

## サイトが変わったとき直す場所

`site.mjs` だけ。`index.mjs` は触らなくてよい。

```bash
# 操作を録画してロケーターを取り出す
SB_CONCIERGE_LOGIN_URL=https://... npm run codegen
```

録画した操作を `site.mjs` の4つの関数に写す。

| 関数 | 約束 |
|---|---|
| `login(page, {loginUrl, id, password})` | 失敗したら throw する |
| `gotoLineList(page)` | 回線一覧のページまで移動する |
| `readPage(page)` | 表示中の表を `[{見出し: 値}, ...]` で返す |
| `gotoNextPage(page)` | 進めたら true、最終ページなら false |

見出しの表記ゆれは `COLUMN_ALIASES` に候補を足せば吸収できる。

## ローカルで動かす

```bash
cd jobs/concierge-bot
npm install
npx playwright install chromium

# モックサイト相手に通しで確認する（本体を localhost:3000 で起動しておく）
SB_CONCIERGE_LOGIN_URL=http://localhost:3000/mock-concierge/login \
SB_CONCIERGE_ID=test SB_CONCIERGE_PASSWORD=test \
RUN_ID=<runId> CALLBACK_TOKEN=<token> \
CALLBACK_URL=http://localhost:3000/api/concierge/observed \
HEADLESS=0 npm start
```

`CALLBACK_URL` を省くと送信せず取得結果を標準出力に出すだけになる。
ロケーターの調整中はこちらが便利。

## 安全側に倒している点

- **ログイン失敗を必ず落とす。** 気づかず空の一覧を取ると、全回線が解約提案になる
- **0件は本体側で失敗扱い。** ロケーターが外れたときに台帳を壊さないため
- **取り切れなかったら `complete: false`。** 本体は解約判定をしない
- **同じ電話番号は1回だけ。** ページ送りが効かず同じページを読み続ける事故を検知する
