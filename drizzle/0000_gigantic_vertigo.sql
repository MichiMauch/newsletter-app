CREATE TABLE `content_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`image` text,
	`date` text,
	`published` integer DEFAULT 1 NOT NULL,
	`synced_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ci_site_slug` ON `content_items` (`site_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_ci_site` ON `content_items` (`site_id`);--> statement-breakpoint
CREATE TABLE `email_automation_enrollments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`automation_id` integer NOT NULL,
	`subscriber_email` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`enrolled_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`cancelled_at` text,
	FOREIGN KEY (`automation_id`) REFERENCES `email_automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_eae_unique` ON `email_automation_enrollments` (`automation_id`,`subscriber_email`);--> statement-breakpoint
CREATE INDEX `idx_eae_automation` ON `email_automation_enrollments` (`automation_id`);--> statement-breakpoint
CREATE INDEX `idx_eae_email` ON `email_automation_enrollments` (`subscriber_email`);--> statement-breakpoint
CREATE INDEX `idx_eae_status` ON `email_automation_enrollments` (`status`);--> statement-breakpoint
CREATE TABLE `email_automation_sends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`step_id` integer NOT NULL,
	`resend_email_id` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`sent_at` text DEFAULT (datetime('now')) NOT NULL,
	`delivered_at` text,
	`opened_at` text,
	`open_count` integer DEFAULT 0 NOT NULL,
	`clicked_at` text,
	`click_count` integer DEFAULT 0 NOT NULL,
	`bounced_at` text,
	`bounce_type` text,
	`complained_at` text,
	FOREIGN KEY (`enrollment_id`) REFERENCES `email_automation_enrollments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`step_id`) REFERENCES `email_automation_steps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_eaS_enrollment` ON `email_automation_sends` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `idx_eaS_resend` ON `email_automation_sends` (`resend_email_id`);--> statement-breakpoint
CREATE TABLE `email_automation_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`automation_id` integer NOT NULL,
	`step_order` integer DEFAULT 0 NOT NULL,
	`delay_hours` integer DEFAULT 0 NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`blocks_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`automation_id`) REFERENCES `email_automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_eas_automation` ON `email_automation_steps` (`automation_id`);--> statement-breakpoint
CREATE TABLE `email_automations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text DEFAULT 'kokomo' NOT NULL,
	`name` text NOT NULL,
	`trigger_type` text DEFAULT 'subscriber_confirmed' NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ea_site` ON `email_automations` (`site_id`);--> statement-breakpoint
CREATE TABLE `newsletter_link_clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`send_id` integer NOT NULL,
	`recipient_id` integer,
	`url` text NOT NULL,
	`clicked_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_nlc_send_id` ON `newsletter_link_clicks` (`send_id`);--> statement-breakpoint
CREATE TABLE `newsletter_recipients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`send_id` integer NOT NULL,
	`email` text NOT NULL,
	`resend_email_id` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`delivered_at` text,
	`opened_at` text,
	`open_count` integer DEFAULT 0 NOT NULL,
	`clicked_at` text,
	`click_count` integer DEFAULT 0 NOT NULL,
	`bounced_at` text,
	`bounce_type` text,
	`complained_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_recipients_resend_email_id_unique` ON `newsletter_recipients` (`resend_email_id`);--> statement-breakpoint
CREATE INDEX `idx_nr_send_id` ON `newsletter_recipients` (`send_id`);--> statement-breakpoint
CREATE INDEX `idx_nr_resend_id` ON `newsletter_recipients` (`resend_email_id`);--> statement-breakpoint
CREATE TABLE `newsletter_sends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text DEFAULT 'kokomo' NOT NULL,
	`post_slug` text NOT NULL,
	`post_title` text NOT NULL,
	`subject` text NOT NULL,
	`blocks_json` text,
	`sent_at` text DEFAULT (datetime('now')) NOT NULL,
	`recipient_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`delivered_count` integer DEFAULT 0 NOT NULL,
	`opened_count` integer DEFAULT 0 NOT NULL,
	`clicked_count` integer DEFAULT 0 NOT NULL,
	`bounced_count` integer DEFAULT 0 NOT NULL,
	`complained_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sends_site` ON `newsletter_sends` (`site_id`);--> statement-breakpoint
CREATE TABLE `newsletter_subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text DEFAULT 'kokomo' NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`confirmed_at` text,
	`unsubscribed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_token_unique` ON `newsletter_subscribers` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sub_site_email` ON `newsletter_subscribers` (`site_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_sub_site` ON `newsletter_subscribers` (`site_id`);--> statement-breakpoint
CREATE INDEX `idx_sub_status` ON `newsletter_subscribers` (`site_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_sub_token` ON `newsletter_subscribers` (`token`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`site_url` text NOT NULL,
	`logo_url` text,
	`primary_color` text DEFAULT '#017734' NOT NULL,
	`accent_color` text DEFAULT '#05DE66' NOT NULL,
	`gradient_end` text DEFAULT '#01ABE7' NOT NULL,
	`font_family` text DEFAULT 'Poppins' NOT NULL,
	`from_email` text NOT NULL,
	`from_name` text NOT NULL,
	`footer_text` text,
	`social_links_json` text DEFAULT '{}' NOT NULL,
	`allowed_origin` text NOT NULL,
	`turnstile_site_key` text,
	`locale` text DEFAULT 'de-CH' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
