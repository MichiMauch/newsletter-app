-- Migration A fuer den "kein Hauptlisten-Konzept"-Refactor.
-- Phase 1: subscriber_lists.slug additiv (nullable); Backfill-Script haengt
-- danach Slugs an, dann macht Migration 0020 die Spalte NOT NULL und droppt
-- is_primary + den dazugehoerigen Index.

ALTER TABLE `subscriber_lists` ADD `slug` text;
