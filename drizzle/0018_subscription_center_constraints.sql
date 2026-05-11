-- Migration B: scharfe Constraints fuer das Subscription-Center-Modell.
--
-- (a) newsletter_subscribers: status-Werte mappen (confirmed -> active,
--     unsubscribed -> blocked) und unsubscribed_at -> blocked_at umbenennen.
-- (b) subscriber_list_members: Tabelle neu aufbauen, sodass subscriber_id
--     NOT NULL ist mit ON DELETE CASCADE; email-Spalte faellt weg; alten
--     Unique-Index (list_id, email) durch (list_id, subscriber_id) ersetzen.
--
-- Setzt voraus, dass scripts/backfill-list-members-fk.mjs --apply zuvor
-- erfolgreich gelaufen ist (alle Members haben subscriber_id IS NOT NULL).

UPDATE `newsletter_subscribers` SET `status` = 'active' WHERE `status` = 'confirmed';--> statement-breakpoint
UPDATE `newsletter_subscribers` SET `status` = 'blocked' WHERE `status` = 'unsubscribed';--> statement-breakpoint

ALTER TABLE `newsletter_subscribers` RENAME COLUMN `unsubscribed_at` TO `blocked_at`;--> statement-breakpoint

-- ── subscriber_list_members: rename + recreate ───────────────────────────
-- Sicherheitsnetz: falls trotz Backfill noch Zeilen mit NULL subscriber_id
-- existieren, werden sie NICHT migriert (waeren nur Tests laut User).
CREATE TABLE `__new_subscriber_list_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`subscriber_id` integer NOT NULL,
	`token` text NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `subscriber_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscriber_id`) REFERENCES `newsletter_subscribers`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

INSERT INTO `__new_subscriber_list_members` (`id`, `list_id`, `subscriber_id`, `token`, `added_at`)
SELECT `id`, `list_id`, `subscriber_id`, `token`, `added_at`
FROM `subscriber_list_members`
WHERE `subscriber_id` IS NOT NULL;--> statement-breakpoint

DROP TABLE `subscriber_list_members`;--> statement-breakpoint
ALTER TABLE `__new_subscriber_list_members` RENAME TO `subscriber_list_members`;--> statement-breakpoint

CREATE UNIQUE INDEX `idx_slm_list_subscriber` ON `subscriber_list_members` (`list_id`,`subscriber_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slm_token` ON `subscriber_list_members` (`token`);--> statement-breakpoint
CREATE INDEX `idx_slm_list` ON `subscriber_list_members` (`list_id`);--> statement-breakpoint
CREATE INDEX `idx_slm_subscriber` ON `subscriber_list_members` (`subscriber_id`);
