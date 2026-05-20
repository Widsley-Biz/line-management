CREATE TABLE `mobile_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`phone_number` text NOT NULL,
	`status` text DEFAULT '契約中' NOT NULL,
	`contract_start` text,
	`contract_end` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_lines_phone_number_unique` ON `mobile_lines` (`phone_number`);--> statement-breakpoint
CREATE INDEX `idx_mobile_lines_tenant` ON `mobile_lines` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `mobile_usage_details` (
	`id` text PRIMARY KEY NOT NULL,
	`mobile_usage_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`phone_number` text NOT NULL,
	`item_name` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`year_month` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`mobile_usage_id`) REFERENCES `mobile_usages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mobile_usage_details_usage` ON `mobile_usage_details` (`mobile_usage_id`);--> statement-breakpoint
CREATE INDEX `idx_mobile_usage_details_tenant` ON `mobile_usage_details` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `mobile_usages` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`year_month` text NOT NULL,
	`total_lines` integer DEFAULT 0 NOT NULL,
	`overage_total` real DEFAULT 0 NOT NULL,
	`sf_status` text DEFAULT '未送信' NOT NULL,
	`sf_sent_at` text,
	`sf_error_message` text,
	`imported_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mobile_usages_tenant_month` ON `mobile_usages` (`tenant_id`,`year_month`);