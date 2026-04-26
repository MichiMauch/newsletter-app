CREATE TABLE `subscriber_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sl_site` ON `subscriber_lists` (`site_id`);--> statement-breakpoint
CREATE TABLE `subscriber_list_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `subscriber_lists`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slm_list_email` ON `subscriber_list_members` (`list_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slm_token` ON `subscriber_list_members` (`token`);--> statement-breakpoint
CREATE INDEX `idx_slm_list` ON `subscriber_list_members` (`list_id`);