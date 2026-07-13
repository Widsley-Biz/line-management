CREATE TABLE IF NOT EXISTS `ip_master_unmatched` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_number` text NOT NULL,
	`sub_number` text,
	`attempted_tenant_key` text NOT NULL,
	`source_name` text,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_tenant_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`resolved_tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `ip_master_unmatched_phone_number_unique` ON `ip_master_unmatched` (`phone_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ip_master_unmatched_status` ON `ip_master_unmatched` (`status`);
