-- Klick-Klassifikation: nicht jeder getrackte Klick ist Engagement.
--
-- is_bot:         Mail-Security-Scanner rufen beim Zustellen mehrere Links im
--                 selben Millisekundenfenster ab. Im Versand vom 06.08. waren
--                 das 2 von 11 "Klickern" (3 Links in 106 bzw. 45 ms).
-- is_unsubscribe: Der Abmeldelink ist click-getrackt und zählte bisher als
--                 Klick — eine Abmeldung hob also die Klickrate.
--
-- Beide Spalten sind additiv mit Default 0; Bestandszeilen werden vom Script
-- scripts/classify-link-clicks.ts nachträglich eingestuft.

ALTER TABLE `newsletter_link_clicks` ADD `is_bot` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `newsletter_link_clicks` ADD `is_unsubscribe` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_nlc_recipient_time` ON `newsletter_link_clicks` (`recipient_id`,`clicked_at`);
