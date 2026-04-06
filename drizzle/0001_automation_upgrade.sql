ALTER TABLE email_automations ADD COLUMN trigger_config text NOT NULL DEFAULT '{}';
ALTER TABLE email_automation_steps ADD COLUMN step_type text NOT NULL DEFAULT 'email';
ALTER TABLE email_automation_enrollments ADD COLUMN trigger_ref text;
CREATE INDEX IF NOT EXISTS idx_nr_email ON newsletter_recipients (email);
