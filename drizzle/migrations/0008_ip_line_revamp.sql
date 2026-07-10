CREATE TABLE IF NOT EXISTS `ip_numbers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`phone_number` text NOT NULL,
	`sub_number` text,
	`status` text DEFAULT '契約中' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `ip_numbers_phone_number_unique` ON `ip_numbers` (`phone_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ip_numbers_tenant` ON `ip_numbers` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ip_tariffs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	`fixed_rate` real DEFAULT 0.06 NOT NULL,
	`mobile_rate` real DEFAULT 0.25 NOT NULL,
	`navi_sec_rate` real DEFAULT 1.2 NOT NULL,
	`navi_amount_rate` real DEFAULT 10.5 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ip_tariffs_tenant` ON `ip_tariffs` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ip_usages` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`year_month` text NOT NULL,
	`fixed_amount` real DEFAULT 0 NOT NULL,
	`mobile_navi_amount` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`sf_status` text DEFAULT '未送信' NOT NULL,
	`sf_sent_at` text,
	`sf_error_message` text,
	`imported_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ip_usages_tenant_month` ON `ip_usages` (`tenant_id`,`year_month`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ip_usage_details` (
	`id` text PRIMARY KEY NOT NULL,
	`ip_usage_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`phone_number` text NOT NULL,
	`call_category` text NOT NULL,
	`call_type_name` text NOT NULL,
	`total_seconds` integer DEFAULT 0 NOT NULL,
	`source_amount` real DEFAULT 0 NOT NULL,
	`computed_amount` real DEFAULT 0 NOT NULL,
	`year_month` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ip_usage_id`) REFERENCES `ip_usages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ip_usage_details_usage` ON `ip_usage_details` (`ip_usage_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ip_usage_details_tenant` ON `ip_usage_details` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ip_usage_details_month` ON `ip_usage_details` (`year_month`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ip_import_files` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`file_hash` text NOT NULL,
	`billing_account` text,
	`year_month` text,
	`row_count` integer DEFAULT 0 NOT NULL,
	`imported_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `ip_import_files_file_hash_unique` ON `ip_import_files` (`file_hash`);
--> statement-breakpoint
INSERT OR IGNORE INTO `ip_tariffs` (`id`, `tenant_id`, `fixed_rate`, `mobile_rate`, `navi_sec_rate`, `navi_amount_rate`)
VALUES ('default', NULL, 0.06, 0.25, 1.2, 10.5);
