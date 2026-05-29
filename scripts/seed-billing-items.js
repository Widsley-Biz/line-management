const Database = require("better-sqlite3");
const { randomUUID } = require("crypto");
const path = require("path");

const dbPath = path.resolve(__dirname, "../lime.db");
const db = new Database(dbPath);

// 旧テーブルを削除して新スキーマで再作成
db.exec(`
  DROP TABLE IF EXISTS mobile_billing_items;
  CREATE TABLE mobile_billing_items (
    id text PRIMARY KEY NOT NULL,
    item_name text NOT NULL,
    is_billable integer NOT NULL DEFAULT 1,
    continuous_import integer NOT NULL DEFAULT 1,
    created_at text DEFAULT (datetime('now')) NOT NULL,
    updated_at text DEFAULT (datetime('now')) NOT NULL
  );
  CREATE UNIQUE INDEX mobile_billing_items_item_name_unique ON mobile_billing_items (item_name);
`);

const ins = db.prepare(
  "INSERT OR IGNORE INTO mobile_billing_items (id, item_name, is_billable, continuous_import) VALUES (?, ?, ?, 1)"
);

// 課金項目（SoftBank実績ベース）
const billable = [
  "通話料　通話定額基本料　対象外通話",
  "通信料　メール（SMS）",
  "通信料　メール（SMS）（他社宛）",
  "通話料　国際電話",
  "通話料　世界対応ケータイ（音声）（日本国内事業者宛）",
  "通信料　世界対応ケータイ（SMS）（日本国内事業者宛）",
  "通話料　ドコモ衛星電話宛",
  "その他　オートチャージ（快適モード）追加データ１ＧＢ",
  "代行分　SoftBank・ワイモバイルまとめて支払い（Google Play）ご利用分",
  "情報料　SoftBank・ワイモバイルまとめて支払い（デジタルコンテンツ等）ご利用分",
  "情報料　SoftBank・ワイモバイルまとめて支払い（Apple等）ご利用分",
  "通話料　通信サービス「0570等」",
];

for (const name of billable) ins.run(randomUUID(), name, 1);

const count = db.prepare("SELECT COUNT(*) as n FROM mobile_billing_items").get();
console.log("完了:", count.n, "件（課金:" + billable.length + "件）");
db.close();
