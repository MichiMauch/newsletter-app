ALTER TABLE `newsletter_sends` ADD `scheduled_for` text;--> statement-breakpoint
CREATE INDEX `idx_sends_scheduled` ON `newsletter_sends` (`status`,`scheduled_for`);