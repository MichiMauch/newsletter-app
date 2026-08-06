-- Grund und Zurechnung einer Sperre festhalten.
--
-- Bisher setzten freiwillige Abmeldung, Hard Bounce und Spam-Beschwerde alle
-- denselben Status 'blocked'. Damit liess sich weder sagen, warum jemand weg
-- ist, noch eine Abmelderate pro Versand berechnen — in Mailchimp und HubSpot
-- eine Kopfzahl direkt neben der Klickrate.
--
-- Bestandszeilen bleiben NULL: warum die vier bereits gesperrten Adressen
-- gesperrt wurden, ist nicht mehr rekonstruierbar. Das Backfill-Script
-- scripts/backfill-block-reason.ts leitet her, was sich noch herleiten laesst
-- (Bounce-Historie), und laesst den Rest ehrlich unbekannt.

ALTER TABLE `newsletter_subscribers` ADD `blocked_reason` text;--> statement-breakpoint
ALTER TABLE `newsletter_subscribers` ADD `blocked_send_id` integer;