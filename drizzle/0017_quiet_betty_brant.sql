ALTER TABLE `subscriber_list_members` ADD `subscriber_id` integer REFERENCES newsletter_subscribers(id);--> statement-breakpoint
CREATE INDEX `idx_slm_subscriber` ON `subscriber_list_members` (`subscriber_id`);--> statement-breakpoint
ALTER TABLE `subscriber_lists` ADD `is_primary` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_sl_primary` ON `subscriber_lists` (`site_id`,`is_primary`);