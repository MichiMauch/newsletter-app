import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ─── Sites ──────────────────────────────────────────────────────────────

export const sites = sqliteTable('sites', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  siteUrl: text('site_url').notNull(),
  logoUrl: text('logo_url'),
  primaryColor: text('primary_color').notNull().default('#017734'),
  accentColor: text('accent_color').notNull().default('#05DE66'),
  gradientEnd: text('gradient_end').notNull().default('#01ABE7'),
  fontFamily: text('font_family').notNull().default('Poppins'),
  fromEmail: text('from_email').notNull(),
  fromName: text('from_name').notNull(),
  footerText: text('footer_text'),
  socialLinksJson: text('social_links_json').notNull().default('{}'),
  allowedOrigin: text('allowed_origin').notNull(),
  turnstileSiteKey: text('turnstile_site_key'),
  locale: text('locale').notNull().default('de-CH'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ─── Content Items ──────────────────────────────────────────────────────

export const contentItems = sqliteTable('content_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  siteId: text('site_id').notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  image: text('image'),
  date: text('date'),
  published: integer('published').notNull().default(1),
  syncedAt: text('synced_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex('idx_ci_site_slug').on(table.siteId, table.slug),
  index('idx_ci_site').on(table.siteId),
])

// ─── Newsletter Subscribers ─────────────────────────────────────────────

export const newsletterSubscribers = sqliteTable('newsletter_subscribers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  siteId: text('site_id').notNull().default('kokomo'),
  email: text('email').notNull(),
  status: text('status').notNull().default('pending').$type<'pending' | 'confirmed' | 'unsubscribed'>(),
  token: text('token').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  confirmedAt: text('confirmed_at'),
  unsubscribedAt: text('unsubscribed_at'),
}, (table) => [
  uniqueIndex('idx_sub_site_email').on(table.siteId, table.email),
  index('idx_sub_site').on(table.siteId),
  index('idx_sub_status').on(table.siteId, table.status),
  index('idx_sub_token').on(table.token),
])

// ─── Newsletter Sends ───────────────────────────────────────────────────

export const newsletterSends = sqliteTable('newsletter_sends', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  siteId: text('site_id').notNull().default('kokomo'),
  postSlug: text('post_slug').notNull(),
  postTitle: text('post_title').notNull(),
  subject: text('subject').notNull(),
  blocksJson: text('blocks_json'),
  sentAt: text('sent_at').notNull().default(sql`(datetime('now'))`),
  recipientCount: integer('recipient_count').notNull().default(0),
  status: text('status').notNull().default('sent'),
  deliveredCount: integer('delivered_count').notNull().default(0),
  clickedCount: integer('clicked_count').notNull().default(0),
  bouncedCount: integer('bounced_count').notNull().default(0),
  complainedCount: integer('complained_count').notNull().default(0),
}, (table) => [
  index('idx_sends_site').on(table.siteId),
])

// ─── Newsletter Recipients ──────────────────────────────────────────────

export const newsletterRecipients = sqliteTable('newsletter_recipients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sendId: integer('send_id').notNull(),
  email: text('email').notNull(),
  resendEmailId: text('resend_email_id').unique(),
  status: text('status').notNull().default('sent').$type<'sent' | 'delivered' | 'clicked' | 'bounced' | 'complained'>(),
  deliveredAt: text('delivered_at'),
  clickedAt: text('clicked_at'),
  clickCount: integer('click_count').notNull().default(0),
  bouncedAt: text('bounced_at'),
  bounceType: text('bounce_type'),
  complainedAt: text('complained_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_nr_send_id').on(table.sendId),
  index('idx_nr_resend_id').on(table.resendEmailId),
])

// ─── Newsletter Link Clicks ─────────────────────────────────────────────

export const newsletterLinkClicks = sqliteTable('newsletter_link_clicks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sendId: integer('send_id').notNull(),
  recipientId: integer('recipient_id'),
  url: text('url').notNull(),
  clickedAt: text('clicked_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_nlc_send_id').on(table.sendId),
])

// ─── Email Automations ──────────────────────────────────────────────────

export const emailAutomations = sqliteTable('email_automations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  siteId: text('site_id').notNull().default('kokomo'),
  name: text('name').notNull(),
  // DEPRECATED: trigger_type/trigger_config moved to trigger node. Kept for legacy fallback.
  triggerType: text('trigger_type').notNull().default('subscriber_confirmed').$type<'subscriber_confirmed' | 'manual' | 'no_activity_days' | 'link_clicked'>(),
  triggerConfig: text('trigger_config').notNull().default('{}'),
  active: integer('active').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_ea_site').on(table.siteId),
])

// ─── Email Automation Steps (DEPRECATED — replaced by automation_nodes) ──
// Kept for FK compat with email_automation_sends and historical data.
// Will be dropped in a future migration once all automations are graph-based.

export const emailAutomationSteps = sqliteTable('email_automation_steps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  automationId: integer('automation_id').notNull().references(() => emailAutomations.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').notNull().default(0),
  delayHours: integer('delay_hours').notNull().default(0),
  subject: text('subject').notNull().default(''),
  stepType: text('step_type').notNull().default('email').$type<'email' | 'last_newsletter'>(),
  blocksJson: text('blocks_json').notNull().default('[]'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_eas_automation').on(table.automationId),
])

// ─── Email Automation Enrollments ───────────────────────────────────────

export const emailAutomationEnrollments = sqliteTable('email_automation_enrollments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  automationId: integer('automation_id').notNull().references(() => emailAutomations.id, { onDelete: 'cascade' }),
  subscriberEmail: text('subscriber_email').notNull(),
  status: text('status').notNull().default('active').$type<'active' | 'completed' | 'cancelled'>(),
  enrolledAt: text('enrolled_at').notNull().default(sql`(datetime('now'))`),
  completedAt: text('completed_at'),
  cancelledAt: text('cancelled_at'),
  triggerRef: text('trigger_ref'),
  currentNodeId: text('current_node_id'),
  contextJson: text('context_json').notNull().default('{}'),
}, (table) => [
  uniqueIndex('idx_eae_unique').on(table.automationId, table.subscriberEmail),
  index('idx_eae_automation').on(table.automationId),
  index('idx_eae_email').on(table.subscriberEmail),
  index('idx_eae_status').on(table.status),
])

// ─── Email Automation Sends ─────────────────────────────────────────────

export const emailAutomationSends = sqliteTable('email_automation_sends', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  enrollmentId: integer('enrollment_id').notNull().references(() => emailAutomationEnrollments.id, { onDelete: 'cascade' }),
  stepId: integer('step_id').notNull().references(() => emailAutomationSteps.id, { onDelete: 'cascade' }),
  resendEmailId: text('resend_email_id'),
  status: text('status').notNull().default('sent'),
  sentAt: text('sent_at').notNull().default(sql`(datetime('now'))`),
  deliveredAt: text('delivered_at'),
  clickedAt: text('clicked_at'),
  clickCount: integer('click_count').notNull().default(0),
  bouncedAt: text('bounced_at'),
  bounceType: text('bounce_type'),
  complainedAt: text('complained_at'),
}, (table) => [
  index('idx_eaS_enrollment').on(table.enrollmentId),
  index('idx_eaS_resend').on(table.resendEmailId),
])

// ─── Automation Graph: Nodes ────────────────────────────────────────────

export const automationNodes = sqliteTable('automation_nodes', {
  id: text('id').primaryKey(),
  automationId: integer('automation_id').notNull().references(() => emailAutomations.id, { onDelete: 'cascade' }),
  nodeType: text('node_type').notNull().$type<'trigger' | 'delay' | 'email' | 'last_newsletter' | 'condition' | 'tag'>(),
  configJson: text('config_json').notNull().default('{}'),
  positionX: integer('position_x').notNull().default(0),
  positionY: integer('position_y').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_an_automation').on(table.automationId),
  index('idx_an_type').on(table.nodeType),
])

// ─── Automation Graph: Edges ────────────────────────────────────────────

export const automationEdges = sqliteTable('automation_edges', {
  id: text('id').primaryKey(),
  automationId: integer('automation_id').notNull().references(() => emailAutomations.id, { onDelete: 'cascade' }),
  sourceNodeId: text('source_node_id').notNull().references(() => automationNodes.id, { onDelete: 'cascade' }),
  targetNodeId: text('target_node_id').notNull().references(() => automationNodes.id, { onDelete: 'cascade' }),
  edgeLabel: text('edge_label'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_ae_automation').on(table.automationId),
  index('idx_ae_source').on(table.sourceNodeId),
])

// ─── Automation Graph: Node Executions (Run-Log) ───────────────────────

export const automationNodeExecutions = sqliteTable('automation_node_executions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  enrollmentId: integer('enrollment_id').notNull().references(() => emailAutomationEnrollments.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  status: text('status').notNull().default('pending').$type<'pending' | 'completed' | 'failed' | 'skipped'>(),
  startedAt: text('started_at').notNull().default(sql`(datetime('now'))`),
  completedAt: text('completed_at'),
  error: text('error'),
  outputJson: text('output_json'),
  retryCount: integer('retry_count').notNull().default(0),
}, (table) => [
  index('idx_ane_enrollment').on(table.enrollmentId),
  index('idx_ane_node').on(table.nodeId),
  index('idx_ane_status').on(table.status),
])

// ─── Subscriber Tags (für Tag-Node + Condition) ────────────────────────

export const subscriberTags = sqliteTable('subscriber_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  siteId: text('site_id').notNull(),
  subscriberEmail: text('subscriber_email').notNull(),
  tag: text('tag').notNull(),
  addedAt: text('added_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex('idx_st_unique').on(table.siteId, table.subscriberEmail, table.tag),
  index('idx_st_email').on(table.siteId, table.subscriberEmail),
  index('idx_st_tag').on(table.siteId, table.tag),
])
