-- Migration B: Hauptlisten-Konzept entfernen.
--   - subscriber_lists.slug auf NOT NULL setzen
--   - is_primary droppen + idx_sl_primary droppen
--   - neuer Unique-Index (site_id, slug)
--
-- SQLite kann ALTER COLUMN auf NOT NULL nicht direkt, daher Tabellen-Rebuild.
-- Voraussetzung: scripts/backfill-list-slugs.mjs --apply ist gelaufen
-- (alle subscriber_lists haben slug IS NOT NULL).

-- Rebuild subscriber_lists ohne is_primary, mit slug NOT NULL.
CREATE TABLE `__new_subscriber_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);--> statement-breakpoint

INSERT INTO `__new_subscriber_lists` (`id`, `site_id`, `name`, `slug`, `description`, `created_at`)
SELECT `id`, `site_id`, `name`, `slug`, `description`, `created_at`
FROM `subscriber_lists`
WHERE `slug` IS NOT NULL;--> statement-breakpoint

DROP TABLE `subscriber_lists`;--> statement-breakpoint
ALTER TABLE `__new_subscriber_lists` RENAME TO `subscriber_lists`;--> statement-breakpoint

CREATE INDEX `idx_sl_site` ON `subscriber_lists` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sl_site_slug` ON `subscriber_lists` (`site_id`,`slug`);
