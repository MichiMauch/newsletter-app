/**
 * Newsletter data layer — Drizzle ORM
 * Barrel re-export. Implementations split by domain:
 *   - newsletter-subscribers.ts (CRUD + tag-signal segmentation)
 *   - newsletter-sends.ts       (sends + recipient tracking + stats)
 *   - newsletter-bounces.ts     (cross-source bounce overview)
 *   - newsletter-stats.ts       (trends + growth)
 */

export * from './newsletter-subscribers'
export * from './newsletter-sends'
export * from './newsletter-bounces'
export * from './newsletter-stats'
