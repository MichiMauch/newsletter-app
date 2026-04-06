-- Migration: Graph-based Workflow System
-- Adds: automation_nodes, automation_edges, automation_node_executions, subscriber_tags
-- Extends: email_automation_enrollments with current_node_id + context_json

ALTER TABLE email_automation_enrollments ADD COLUMN current_node_id text;
--> statement-breakpoint
ALTER TABLE email_automation_enrollments ADD COLUMN context_json text NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE TABLE automation_nodes (
  id text PRIMARY KEY NOT NULL,
  automation_id integer NOT NULL,
  node_type text NOT NULL,
  config_json text NOT NULL DEFAULT '{}',
  position_x integer NOT NULL DEFAULT 0,
  position_y integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (automation_id) REFERENCES email_automations(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX idx_an_automation ON automation_nodes (automation_id);
--> statement-breakpoint
CREATE INDEX idx_an_type ON automation_nodes (node_type);
--> statement-breakpoint
CREATE TABLE automation_edges (
  id text PRIMARY KEY NOT NULL,
  automation_id integer NOT NULL,
  source_node_id text NOT NULL,
  target_node_id text NOT NULL,
  edge_label text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (automation_id) REFERENCES email_automations(id) ON DELETE CASCADE,
  FOREIGN KEY (source_node_id) REFERENCES automation_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_node_id) REFERENCES automation_nodes(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX idx_ae_automation ON automation_edges (automation_id);
--> statement-breakpoint
CREATE INDEX idx_ae_source ON automation_edges (source_node_id);
--> statement-breakpoint
CREATE TABLE automation_node_executions (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  enrollment_id integer NOT NULL,
  node_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at text NOT NULL DEFAULT (datetime('now')),
  completed_at text,
  error text,
  output_json text,
  retry_count integer NOT NULL DEFAULT 0,
  FOREIGN KEY (enrollment_id) REFERENCES email_automation_enrollments(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX idx_ane_enrollment ON automation_node_executions (enrollment_id);
--> statement-breakpoint
CREATE INDEX idx_ane_node ON automation_node_executions (node_id);
--> statement-breakpoint
CREATE INDEX idx_ane_status ON automation_node_executions (status);
--> statement-breakpoint
CREATE TABLE subscriber_tags (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  site_id text NOT NULL,
  subscriber_email text NOT NULL,
  tag text NOT NULL,
  added_at text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_st_unique ON subscriber_tags (site_id, subscriber_email, tag);
--> statement-breakpoint
CREATE INDEX idx_st_email ON subscriber_tags (site_id, subscriber_email);
--> statement-breakpoint
CREATE INDEX idx_st_tag ON subscriber_tags (site_id, tag);
