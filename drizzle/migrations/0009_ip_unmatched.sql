CREATE TABLE IF NOT EXISTS `ip_import_unmatched` (
	`id` text PRIMARY KEY NOT NULL,
	`year_month` text NOT NULL,
	`phone_number` text NOT NULL,
	`items_json` text DEFAULT '{}' NOT NULL,
	`total_seconds` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_tenant_id` text,
	`imported_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`resolved_tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ip_import_unmatched_month` ON `ip_import_unmatched` (`year_month`);
--> statement-breakpoint
ALTER TABLE `ip_usages` ADD COLUMN `sf_no_action_reason` text;
