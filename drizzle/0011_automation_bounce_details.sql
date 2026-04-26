ALTER TABLE `email_automation_sends` ADD `bounce_sub_type` text;--> statement-breakpoint
ALTER TABLE `email_automation_sends` ADD `bounce_message` text;--> statement-breakpoint
CREATE INDEX `idx_eaS_bounce_sub_type` ON `email_automation_sends` (`bounce_sub_type`);
