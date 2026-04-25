CREATE TABLE `subscriber_engagement` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`subscriber_email` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`tier` text DEFAULT 'cold' NOT NULL,
	`sends_90d` integer DEFAULT 0 NOT NULL,
	`opens_90d` integer DEFAULT 0 NOT NULL,
	`clicks_90d` integer DEFAULT 0 NOT NULL,
	`last_open_at` text,
	`last_click_at` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_se_unique` ON `subscriber_engagement` (`site_id`,`subscriber_email`);--> statement-breakpoint
CREATE INDEX `idx_se_tier` ON `subscriber_engagement` (`site_id`,`tier`);--> statement-breakpoint
CREATE INDEX `idx_se_score` ON `subscriber_engagement` (`site_id`,`score`);--> statement-breakpoint
ALTER TABLE `subscriber_open_signals` ADD `is_bot_open` integer DEFAULT 0 NOT NULL;