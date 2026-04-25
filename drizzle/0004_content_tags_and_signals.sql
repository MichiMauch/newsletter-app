CREATE TABLE `subscriber_tag_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`subscriber_email` text NOT NULL,
	`tag` text NOT NULL,
	`click_count` integer DEFAULT 0 NOT NULL,
	`applied` integer DEFAULT 0 NOT NULL,
	`first_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_seen_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sts_unique` ON `subscriber_tag_signals` (`site_id`,`subscriber_email`,`tag`);--> statement-breakpoint
CREATE INDEX `idx_sts_email` ON `subscriber_tag_signals` (`site_id`,`subscriber_email`);--> statement-breakpoint
ALTER TABLE `content_items` ADD `tags_json` text DEFAULT '[]' NOT NULL;