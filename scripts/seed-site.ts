/**
 * Phase 2, Step 1: Create the 'kokomo' site entry
 * Usage: npx tsx scripts/seed-site.ts
 */

import { config } from 'dotenv'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sites } from '../lib/schema'

config({ path: '.env.local' })

async function main() {
  const client = createClient({ url: process.env.TURSO_DB_URL!, authToken: process.env.TURSO_DB_TOKEN! })
  const db = drizzle(client)

  console.log('Inserting kokomo site config...')

  await db.insert(sites).values({
    id: 'kokomo',
    name: 'KOKOMO House',
    siteUrl: 'https://www.kokomo.house',
    logoUrl: 'https://www.kokomo.house/static/images/kokomo-bildmarke.svg',
    primaryColor: '#017734',
    accentColor: '#05DE66',
    gradientEnd: '#01ABE7',
    fontFamily: 'Poppins',
    fromEmail: 'noreply@kokomo.house',
    fromName: 'KOKOMO House',
    footerText: null,
    socialLinksJson: JSON.stringify({
      Instagram: 'https://www.instagram.com/kokomo.house',
      Facebook: 'https://www.facebook.com/groups/tinyhousecommunityschweiz',
      LinkedIn: 'https://www.linkedin.com/in/michimauch/',
      'E-Mail': 'mailto:michi.mauch@gmail.com',
    }),
    allowedOrigin: 'https://www.kokomo.house',
    turnstileSiteKey: null,
    locale: 'de-CH',
  }).onConflictDoNothing()

  console.log('Site "kokomo" created (or already exists).')
}

main().catch(console.error)
