-- GDPR Art. 7.1 ("Nachweis der Einwilligung"): record IP + User-Agent at
-- subscribe time and at confirmation time so the operator can prove the
-- subscriber actively opted in if a complaint arises. All four columns are
-- nullable — legacy rows and bulk-import paths leave them empty.
ALTER TABLE `newsletter_subscribers` ADD `subscribed_ip` text;--> statement-breakpoint
ALTER TABLE `newsletter_subscribers` ADD `subscribed_user_agent` text;--> statement-breakpoint
ALTER TABLE `newsletter_subscribers` ADD `confirmed_ip` text;--> statement-breakpoint
ALTER TABLE `newsletter_subscribers` ADD `confirmed_user_agent` text;
