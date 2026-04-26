ALTER TABLE `newsletter_recipients` ADD `bounce_sub_type` text;--> statement-breakpoint
ALTER TABLE `newsletter_recipients` ADD `bounce_message` text;--> statement-breakpoint
CREATE INDEX `idx_nr_bounce_sub_type` ON `newsletter_recipients` (`bounce_sub_type`);
