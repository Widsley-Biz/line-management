-- SB法人コンシェル同期（Phase B/C/D の土台）
--
-- 設計上の不変条件:
--   INV-2  同期処理は mobile_lines を更新しない。concierge_lines / concierge_diffs にしか書かない。
--          承認APIだけが mobile_lines を触る。
--
-- scripts/migrate-on-start.mjs は追加型SQLしか安全に流せない（DROP・型変更は禁止）。
-- meta/_journal.json に idx 12 / when 1783900000000 を追記すること。

-- ── mobile_lines（台帳）に列追加 ────────────────────────────
ALTER TABLE `mobile_lines` ADD COLUMN `phone_key` text;
--> statement-breakpoint
ALTER TABLE `mobile_lines` ADD COLUMN `imei` text;
--> statement-breakpoint
ALTER TABLE `mobile_lines` ADD COLUMN `iccid` text;
--> statement-breakpoint
ALTER TABLE `mobile_lines` ADD COLUMN `concierge_name` text;
--> statement-breakpoint
ALTER TABLE `mobile_lines` ADD COLUMN `concierge_status` text DEFAULT '未確認' NOT NULL;
--> statement-breakpoint
ALTER TABLE `mobile_lines` ADD COLUMN `concierge_synced_at` text;
--> statement-breakpoint
ALTER TABLE `mobile_lines` ADD COLUMN `concierge_error_message` text;
--> statement-breakpoint
-- 既存行の phone_key をバックフィル（ハイフン・空白除去＋先頭0除去＝phoneMatchKey と同じ規則）
UPDATE `mobile_lines` SET `phone_key` =
  CASE WHEN substr(replace(replace(`phone_number`, '-', ''), ' ', ''), 1, 1) = '0'
       THEN substr(replace(replace(`phone_number`, '-', ''), ' ', ''), 2)
       ELSE replace(replace(`phone_number`, '-', ''), ' ', '') END
WHERE `phone_key` IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_mobile_lines_phone_key` ON `mobile_lines` (`phone_key`);
--> statement-breakpoint

-- ── 実行履歴（失敗も必ず残す。PERF-02 の教訓） ──────────────
CREATE TABLE IF NOT EXISTS `concierge_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_type` text NOT NULL,
	`trigger` text NOT NULL,
	`triggered_by_user_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`queued_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`heartbeat_at` text,
	`current_step` text,
	`lines_seen` integer DEFAULT 0 NOT NULL,
	`diffs_created` integer DEFAULT 0 NOT NULL,
	`writes_attempted` integer DEFAULT 0 NOT NULL,
	`writes_succeeded` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`log_json` text DEFAULT '[]' NOT NULL,
	`artifacts_json` text DEFAULT '[]' NOT NULL,
	`callback_token` text NOT NULL,
	`execution_name` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`triggered_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_concierge_runs_queued` ON `concierge_sync_runs` (`queued_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_concierge_runs_status` ON `concierge_sync_runs` (`status`);
--> statement-breakpoint

-- ── コンシェル側の現状ミラー（電話番号ごとに1行のupsert） ────
CREATE TABLE IF NOT EXISTS `concierge_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_key` text NOT NULL,
	`phone_number` text NOT NULL,
	`contact_name` text,
	`imei` text,
	`iccid` text,
	`dept_code` text,
	`dept_name` text,
	`plan_name` text,
	`line_status` text,
	`source` text NOT NULL,
	`source_ref` text,
	`observed_at` text NOT NULL,
	`raw_json` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`last_seen_run_id` text,
	`disappeared_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`last_seen_run_id`) REFERENCES `concierge_sync_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `concierge_lines_phone_key_unique` ON `concierge_lines` (`phone_key`);
--> statement-breakpoint
-- 番号変更（ICCIDが同じで電話番号が変わった）の検知にICCIDを突合キーとして使う
CREATE INDEX IF NOT EXISTS `idx_concierge_lines_iccid` ON `concierge_lines` (`iccid`);
--> statement-breakpoint

-- ── 差分（提案→承認→反映）。削除しない＝これが恒久的な変更記録 ──
CREATE TABLE IF NOT EXISTS `concierge_diffs` (
	`id` text PRIMARY KEY NOT NULL,
	`direction` text NOT NULL,
	`diff_type` text NOT NULL,
	`phone_key` text NOT NULL,
	`phone_number` text NOT NULL,
	`mobile_line_id` text,
	`tenant_id` text,
	`field` text,
	`before_value` text,
	`after_value` text,
	`base_concierge_value` text,
	`payload_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`detected_run_id` text NOT NULL,
	`applied_run_id` text,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`applied_at` text,
	`error_message` text,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`mobile_line_id`) REFERENCES `mobile_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`detected_run_id`) REFERENCES `concierge_sync_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applied_run_id`) REFERENCES `concierge_sync_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_concierge_diffs_status` ON `concierge_diffs` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_concierge_diffs_phone` ON `concierge_diffs` (`phone_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_concierge_diffs_run` ON `concierge_diffs` (`detected_run_id`);
--> statement-breakpoint
-- 未処理の差分は (方向×種別×番号×項目) につき最大1件。二重承認・二重反映をDBレベルで禁止する
CREATE UNIQUE INDEX IF NOT EXISTS `idx_concierge_diffs_open`
  ON `concierge_diffs` (`direction`, `diff_type`, `phone_key`, `field`)
  WHERE `status` IN ('pending', 'approved');
--> statement-breakpoint

-- ── アプリ内お知らせ ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link_url` text,
	`ref_table` text,
	`ref_id` text,
	`slack_status` text DEFAULT 'skipped' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notifications_created` ON `notifications` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audit_logs_target` ON `audit_logs` (`target_table`, `target_id`);
