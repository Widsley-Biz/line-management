ALTER TABLE `users` ADD COLUMN `sf_user_id` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `sf_access_token` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `sf_refresh_token` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `sf_token_expires_at` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `sf_instance_url` text;
