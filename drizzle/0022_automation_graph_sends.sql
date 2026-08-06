-- email_automation_sends für Graph-Automationen öffnen.
--
-- Zwei Änderungen: step_id wird nullable, node_id kommt dazu. Graph-Nodes haben
-- keine Zeile in email_automation_steps, konnten hier also gar nicht abgelegt
-- werden — deshalb fand der Resend-Webhook zu ihren Mails nichts und verwarf
-- Klicks und Bounces stillschweigend.
--
-- SQLite kann NOT NULL nicht per ALTER entfernen, daher der Tabellen-Neubau.
-- Die Tabelle ist zum Migrationszeitpunkt leer (es wurde noch nie eine
-- Automations-Mail verschickt), das Kopieren ist also ein No-op.
--
-- ACHTUNG: drizzle-kit generiert das INSERT hier fehlerhaft — es selektiert
-- node_id aus der ALTEN Tabelle, die diese Spalte noch nicht hat. Deshalb steht
-- unten NULL statt "node_id" in der SELECT-Liste.

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_email_automation_sends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`step_id` integer,
	`node_id` text,
	`resend_email_id` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`sent_at` text DEFAULT (datetime('now')) NOT NULL,
	`delivered_at` text,
	`clicked_at` text,
	`click_count` integer DEFAULT 0 NOT NULL,
	`bounced_at` text,
	`bounce_type` text,
	`bounce_sub_type` text,
	`bounce_message` text,
	`complained_at` text,
	FOREIGN KEY (`enrollment_id`) REFERENCES `email_automation_enrollments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`step_id`) REFERENCES `email_automation_steps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_email_automation_sends`("id", "enrollment_id", "step_id", "node_id", "resend_email_id", "status", "sent_at", "delivered_at", "clicked_at", "click_count", "bounced_at", "bounce_type", "bounce_sub_type", "bounce_message", "complained_at") SELECT "id", "enrollment_id", "step_id", NULL, "resend_email_id", "status", "sent_at", "delivered_at", "clicked_at", "click_count", "bounced_at", "bounce_type", "bounce_sub_type", "bounce_message", "complained_at" FROM `email_automation_sends`;--> statement-breakpoint
DROP TABLE `email_automation_sends`;--> statement-breakpoint
ALTER TABLE `__new_email_automation_sends` RENAME TO `email_automation_sends`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_eaS_enrollment` ON `email_automation_sends` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `idx_eaS_resend` ON `email_automation_sends` (`resend_email_id`);--> statement-breakpoint
CREATE INDEX `idx_eaS_bounce_sub_type` ON `email_automation_sends` (`bounce_sub_type`);
