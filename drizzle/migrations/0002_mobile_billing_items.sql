CREATE TABLE `mobile_billing_items` (
	`id` text PRIMARY KEY NOT NULL,
	`column_index` integer NOT NULL,
	`item_name` text NOT NULL,
	`is_billable` integer NOT NULL DEFAULT true,
	`continuous_import` integer NOT NULL DEFAULT true,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_billing_items_column_index_unique` ON `mobile_billing_items` (`column_index`);
--> statement-breakpoint
-- 既知の15課金項目をシード
INSERT INTO `mobile_billing_items` (`id`, `column_index`, `item_name`, `is_billable`, `continuous_import`) VALUES
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 12, '通話料　通話定額基本料　対象外通話', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 14, '通信料　メール（SMS）', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 15, '通信料　メール（SMS）（他社宛）', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 16, '通話料　国際電話（SoftBank宛）', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 17, '通話料　国際電話（他社宛）', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 18, '通話料　世界対応ケータイ（音声）（日本国内事業者宛）', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 19, '通信料　世界対応ケータイ（SMS）（日本国内事業者宛）', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 20, '通話料　ドコモ衛星電話宛', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 21, '通信料　メール（SMS）（国内他社）', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 22, '通信料　メール（SMS）（国内他社宛）', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 36, 'その他　オートチャージ（快適モード）追加データ１ＧＢ', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 55, '代行分　SoftBank・ワイモバイルまとめて支払い（Google Play）ご利用分', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 56, '情報料　SoftBank・ワイモバイルまとめて支払い（デジタルコンテンツ等）ご利用分', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 57, '情報料　SoftBank・ワイモバイルまとめて支払い（Apple等）ご利用分', 1, 1),
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 58, '通話料　通信サービス「0570等」', 1, 1);
