/**
 * Phase 2, Step 4: Sync content from kokomo2026 Astro content collection to newsletter-app DB
 * Usage: npx tsx scripts/sync-content.ts
 *
 * This reads the Astro content collection (markdown files) from kokomo2026
 * and upserts them into the content_items table.
 *
 * Requires:
 *   TURSO_DB_URL / TURSO_DB_TOKEN  — newsletter-app DB
 *   KOKOMO_CONTENT_DIR             — path to kokomo2026/src/content/posts/ (optional, has default)
 */

import { config } from 'dotenv'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import { contentItems } from '../lib/schema'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

config({ path: '.env.local' })

const CONTENT_DIR = process.env.KOKOMO_CONTENT_DIR || '/Users/michaelmauch/Documents/Development/kokomo2026/src/content/posts'

interface FrontMatter {
  title: string
  summary?: string
  images?: string | string[]
  date?: string
  draft?: boolean
}

function parseFrontMatter(content: string): FrontMatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  const yaml = match[1]
  const result: Record<string, unknown> = {}

  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value: unknown = line.slice(colonIdx + 1).trim()

    // Handle quoted strings
    if (typeof value === 'string' && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1)
    } else if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    } else if (value === 'true') {
      value = true
    } else if (value === 'false') {
      value = false
    }

    result[key] = value
  }

  return {
    title: (result.title as string) || '',
    summary: result.summary as string | undefined,
    images: result.images as string | string[] | undefined,
    date: result.date as string | undefined,
    draft: result.draft as boolean | undefined,
  }
}

function getFirstImage(images: string | string[] | undefined): string | null {
  if (!images) return null
  if (Array.isArray(images)) return images[0] ?? null
  return images
}

async function main() {
  const client = createClient({
    url: process.env.TURSO_DB_URL!,
    authToken: process.env.TURSO_DB_TOKEN!,
  })
  const db = drizzle(client)

  console.log(`Reading content from: ${CONTENT_DIR}`)

  let files: string[]
  try {
    files = await readdir(CONTENT_DIR)
  } catch {
    console.error(`Cannot read directory: ${CONTENT_DIR}`)
    console.error('Set KOKOMO_CONTENT_DIR to the correct path.')
    process.exit(1)
  }

  const mdFiles = files.filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
  console.log(`Found ${mdFiles.length} content files.`)

  let synced = 0
  for (const file of mdFiles) {
    const content = await readFile(join(CONTENT_DIR, file), 'utf-8')
    const fm = parseFrontMatter(content)
    if (!fm || !fm.title) continue

    const slug = file.replace(/\.(md|mdx)$/, '')

    await db.insert(contentItems).values({
      siteId: 'kokomo',
      slug,
      title: fm.title,
      summary: fm.summary ?? null,
      image: getFirstImage(fm.images),
      date: fm.date ?? null,
      published: fm.draft ? 0 : 1,
      syncedAt: sql`datetime('now')`,
    }).onConflictDoUpdate({
      target: [contentItems.siteId, contentItems.slug],
      set: {
        title: sql`excluded.title`,
        summary: sql`excluded.summary`,
        image: sql`excluded.image`,
        date: sql`excluded.date`,
        published: sql`excluded.published`,
        syncedAt: sql`datetime('now')`,
      },
    })
    synced++
  }

  console.log(`Synced ${synced} content items.`)
}

main().catch(console.error)
