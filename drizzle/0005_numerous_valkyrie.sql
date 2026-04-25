CREATE TABLE `scheduled_sends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`send_id` integer NOT NULL,
	`site_id` text NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`scheduled_at_utc` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resend_email_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`pushed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`send_id`) REFERENCES `newsletter_sends`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ss_send` ON `scheduled_sends` (`send_id`);--> statement-breakpoint
CREATE INDEX `idx_ss_due` ON `scheduled_sends` (`status`,`scheduled_at_utc`);--> statement-breakpoint
CREATE INDEX `idx_ss_resend` ON `scheduled_sends` (`resend_email_id`);--> statement-breakpoint
CREATE TABLE `subscriber_open_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`subscriber_email` text NOT NULL,
	`opened_at_utc` text NOT NULL,
	`hour_local` integer NOT NULL,
	`weekday` integer NOT NULL,
	`tz_offset_minutes` integer DEFAULT 60 NOT NULL,
	`source` text DEFAULT 'opened' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sos_email` ON `subscriber_open_signals` (`site_id`,`subscriber_email`);--> statement-breakpoint
CREATE INDEX `idx_sos_recent` ON `subscriber_open_signals` (`site_id`,`subscriber_email`,`opened_at_utc`);--> statement-breakpoint
CREATE TABLE `subscriber_send_time_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`subscriber_email` text NOT NULL,
	`best_hour_local` integer NOT NULL,
	`second_hour_local` integer,
	`preferred_weekday` integer,
	`sample_size` integer DEFAULT 0 NOT NULL,
	`confidence` text DEFAULT 'low' NOT NULL,
	`tz_offset_minutes` integer DEFAULT 60 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sstp_unique` ON `subscriber_send_time_profile` (`site_id`,`subscriber_email`);