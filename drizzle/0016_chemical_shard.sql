CREATE TABLE `newsletter_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text DEFAULT 'kokomo' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`preheader` text,
	`ab_test_enabled` integer DEFAULT 0 NOT NULL,
	`subject_variant_b` text,
	`blocks_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`last_tested_at` text,
	`last_tested_to` text,
	`finalized_at` text,
	`sent_at` text,
	`sent_send_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`sent_send_id`) REFERENCES `newsletter_sends`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_nd_site_status` ON `newsletter_drafts` (`site_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_nd_site` ON `newsletter_drafts` (`site_id`);