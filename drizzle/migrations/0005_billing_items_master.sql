-- 課金項目マスタの整備
-- 1. schema.ts に存在しない column_index 列を削除（手動追加・CSV取込が NOT NULL 制約で失敗するバグの修正）
-- 2. item_name にユニークインデックスを追加（schema.ts と一致させる）
-- 3. マスタを現行の54項目（課金12・非課金42）に置き換え
DROP INDEX IF EXISTS `mobile_billing_items_column_index_unique`;
--> statement-breakpoint
ALTER TABLE `mobile_billing_items` DROP COLUMN `column_index`;
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_billing_items_item_name_unique` ON `mobile_billing_items` (`item_name`);
--> statement-breakpoint
DELETE FROM `mobile_billing_items`;
--> statement-breakpoint
INSERT INTO `mobile_billing_items` (`id`, `item_name`, `is_billable`, `continuous_import`) VALUES
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '代行分　ソフトバンク・ワイモバイルまとめて支払い（Ｇｏｏｇｌｅ　Ｐｌａｙ）　ご利用分', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '利用料　番号案内料金', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '情報料　ソフトバンク・ワイモバイルまとめて支払い（デジタルコンテンツ等）　ご利用分', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '情報料　ソフトバンク・ワイモバイルまとめて支払い（Ａｐｐｌｅ等）　ご利用分', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通信料　メール（ＳＭＳ）', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通信料　メール（ＳＭＳ）（他社宛）', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通信料　国際ＳＭＳ', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通話料　ドコモ衛星電話宛', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通話料　世界対応ケータイ（音声）（日本国内事業者宛）', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通話料　国際電話', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通話料　通信サービス「０５７０等」', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通話料　通話定額基本料　対象外通話', 1, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), 'その他　ユニバーサルサービス料', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), 'その他　故障修理費', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), 'その他　端末貸出料', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), 'その他　紛失時損害金', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), 'その他　電話ユニバーサルサービス料', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), 'その他　電話リレーサービス料', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '割引　端末貸出精割引', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '合計', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '基本料　基本プラン（音声）', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '基本料　通話定額基本料', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '定額料　データプラン５ＧＢ（法人）', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '定額料　データ定額　５ＧＢ', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '定額料　データ定額パック・標準（８）', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '手数料　通話料明細書発行', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '手数料　電話番号変更手数料', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '手数料　ＵＳＩＭカード再発行手数料', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　ウェブ使用料', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　グループ通話', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　スマートフォン法人基本パック', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　ソフトバンクＷｉ－Ｆｉスポット', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　テザリングオプション', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　ナンバーブロック', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　レンタル保守パック（ｓ）', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　レンタル保守パック（ｓ）　Ｎ', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　割込通話', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　定額オプション＋', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　留守番電話プラス', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　通話録音サービス', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　通話録音サービス　ネットワーク利用料', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '月額料　５Ｇデータ通信基本料', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '消費税等　計', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '無料　テザリングオプション無料特典', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '無料　定額オプション＋　無料通話分', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '無料　定額オプション＋　無料通話分（ＳＭＳ）', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '調整金　レンタル保守パック', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通信料　データ通信（４Ｇ　ＬＴＥ）＠０．０５円', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通信料　データ通信（４Ｇ　ＬＴＥ／５Ｇ）＠０．０５円', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通信料　データ通信（４Ｇ）＠０．０５円', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通信料　データ通信（４Ｇ／５Ｇ）＠０．０５円', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通信料　Ｓ！メール（ＭＭＳ）（無料分）＠０円', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通信料　Ｓ！メール（ＭＭＳ）＠０．０５円', 0, 1),
  ((lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), '通話料　基本プラン（音声）', 0, 1);
