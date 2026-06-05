CREATE TABLE `mobile_import_unmatched` (
  `id` text PRIMARY KEY NOT NULL,
  `year_month` text NOT NULL,
  `raw_name` text NOT NULL,
  `phone_number` text,
  `overage_total` real NOT NULL DEFAULT 0,
  `items_json` text NOT NULL DEFAULT '{}',
  `status` text NOT NULL DEFAULT 'pending',
  `resolved_tenant_id` text REFERENCES tenants(id),
  `imported_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `unmatched_year_month_idx` ON `mobile_import_unmatched` (`year_month`);
--> statement-breakpoint
CREATE INDEX `unmatched_status_idx` ON `mobile_import_unmatched` (`status`);
