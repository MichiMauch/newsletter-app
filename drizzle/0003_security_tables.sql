CREATE TABLE `admin_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rl_key_window` ON `rate_limits` (`key`,`window_start`);
--> statement-breakpoint
CREATE INDEX `idx_rl_key` ON `rate_limits` (`key`);
