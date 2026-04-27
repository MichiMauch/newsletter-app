CREATE TABLE `newsletter_send_variants` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `send_id` integer NOT NULL,
  `label` text NOT NULL,
  `subject` text NOT NULL,
  `recipient_count` integer NOT NULL DEFAULT 0,
  `delivered_count` integer NOT NULL DEFAULT 0,
  `clicked_count` integer NOT NULL DEFAULT 0,
  `bounced_count` integer NOT NULL DEFAULT 0,
  `complained_count` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`send_id`) REFERENCES `newsletter_sends`(`id`) ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_nsv_unique` ON `newsletter_send_variants` (`send_id`, `label`);--> statement-breakpoint
CREATE INDEX `idx_nsv_send` ON `newsletter_send_variants` (`send_id`);--> statement-breakpoint
ALTER TABLE `newsletter_recipients` ADD `variant_label` text;--> statement-breakpoint
CREATE INDEX `idx_nr_send_variant` ON `newsletter_recipients` (`send_id`, `variant_label`);--> statement-breakpoint
ALTER TABLE `scheduled_sends` ADD `variant_label` text;
