# Newsletter Standalone App — Phase 1 Implementierungsplan

## Context
Die Newsletter-Funktionalität wird aus kokomo2026 (Astro) in eine eigenständige Next.js 16 App extrahiert. Ziel: Multi-Site-fähiges Newsletter-System mit eigenem Admin, eigener DB, eigener Domain. Phase 1 baut die App auf — kokomo2026 bleibt unverändert.

**Source:** `/Users/michaelmauch/Documents/Development/kokomo2026/src/`
**Target:** `/Users/michaelmauch/Documents/Development/newsletter-app/`

---

## Dateistruktur (Ziel)

```
app/
├── layout.tsx                          # Root layout
├── globals.css                         # Tailwind 4
├── page.tsx                            # Landing / redirect
│
├── api/
│   ├── v1/
│   │   ├── subscribe/route.ts          # POST - Public subscribe
│   │   ├── content-sync/route.ts       # POST - Content sync from external sites
│   │   └── webhooks/
│   │       └── resend/route.ts         # POST - Resend webhook handler
│   ├── admin/
│   │   ├── login/route.ts              # POST - Admin login
│   │   ├── newsletter/route.ts         # GET/POST - Newsletter CRUD & send
│   │   ├── automations/route.ts        # GET/POST - Automation CRUD
│   │   └── newsletter-trends/route.ts  # GET - Analytics
│   └── cron/
│       └── automation-processor/route.ts # GET - Background job
│
├── newsletter/
│   ├── bestaetigen/page.tsx            # Confirmation handler
│   ├── bestaetigt/page.tsx             # Success page
│   └── abgemeldet/page.tsx             # Unsubscribe confirmation
│
├── unsubscribe/page.tsx                # Unsubscribe handler
│
└── admin/
    └── newsletter/page.tsx             # Admin SPA

lib/
├── db.ts                               # Turso client (neu, mit site_id support)
├── newsletter.ts                       # Subscriber & send data layer
├── newsletter-template.ts              # HTML email builder
├── newsletter-blocks.ts                # Block types
├── notify.ts                           # Email sending (NUR Newsletter, keine Comments)
├── automation.ts                       # Drip campaigns
├── admin-auth.ts                       # Auth (angepasst für Next.js)
├── site-config.ts                      # Multi-site branding config
└── content.ts                          # Content items data layer (ersetzt getCollection)

components/
├── AdminNewsletter.tsx                 # Admin interface (Client Component)
└── AutomationEditor.tsx                # Automation builder (Client Component)

scripts/
└── migrate.ts                          # Konsolidierte DB-Migration
```

---

## Schritt-für-Schritt Plan

### Schritt 1: Turso DB Client + Konsolidierte Migration
**Dateien:** `lib/db.ts`, `scripts/migrate.ts`

- Turso Client mit `TURSO_DB_URL` + `TURSO_DB_TOKEN`
- Alle Tabellen in einer Migration, MIT `site_id TEXT NOT NULL DEFAULT 'kokomo'`:
  - `newsletter_subscribers` (+ site_id)
  - `newsletter_sends` (+ site_id, + blocks_json)
  - `newsletter_recipients`
  - `newsletter_link_clicks`
  - `email_automations` (+ site_id)
  - `email_automation_steps`
  - `email_automation_enrollments`
  - `email_automation_sends`
  - **NEU:** `content_items` (site_id, slug, title, summary, image, date, published)
  - **NEU:** `sites` (id, name, logo_url, primary_color, accent_color, from_email, from_name, site_url, footer_text, social_links_json, turnstile_site_key, allowed_origin)

### Schritt 2: Lib-Dateien portieren
**Dateien:** `lib/newsletter.ts`, `lib/newsletter-blocks.ts`, `lib/content.ts`, `lib/automation.ts`

- Kopieren von kokomo2026, anpassen:
  - `import.meta.env` → `process.env`
  - `getClient()` → eigener Turso import aus `lib/db.ts`
  - Alle Queries erhalten `site_id` Parameter
  - `getCollection('posts')` → Queries auf `content_items` Tabelle
- **content.ts** (NEU): `getContentItems(siteId)`, `getContentItem(siteId, slug)`, `upsertContentItems(siteId, items[])`

### Schritt 3: Branding/Site-Config
**Datei:** `lib/site-config.ts`

- `getSiteConfig(siteId)` → liest aus `sites` Tabelle
- Fallback auf ENV-basierte Defaults für Single-Site-Betrieb
- Alle hardcoded Werte (Farben, Logo, Social Links, Footer-Text) werden aus DB geladen

### Schritt 4: Email Templates refaktorieren
**Dateien:** `lib/newsletter-template.ts`, `lib/notify.ts`

- Templates erhalten `SiteConfig` Parameter statt hardcoded Werte
- `notify.ts`: NUR Newsletter-Funktionen (sendConfirmation, sendNewsletter, sendMultiBlock)
- Comment-Notifications bleiben in kokomo2026
- `RESEND_FROM_EMAIL` → `siteConfig.from_email` pro Site

### Schritt 5: Auth-System
**Datei:** `lib/admin-auth.ts`

- Kopie von kokomo2026, angepasst:
  - `import.meta.env` → `process.env`
  - Salt: konfigurierbar statt hardcoded `'kokomo-admin-salt'`
  - Cookie-basierte Session mit `cookies()` (async in Next.js 16)

### Schritt 6: API Routes (Next.js 16 App Router)
**Dateien:** `app/api/v1/subscribe/route.ts`, `app/api/admin/newsletter/route.ts`, etc.

**Konvertierung von Pages API → App Router Route Handlers:**
- `export default function handler(req, res)` → `export async function GET/POST(request: Request)`
- `res.json()` → `Response.json()`
- `res.status(401)` → `new Response(null, { status: 401 })`
- Streaming: `new Response(ReadableStream)` (nativ supported)
- `params` muss ge-awaited werden (Next.js 16 Breaking Change)

**Wichtige Routes:**
1. `POST /api/v1/subscribe` — Public, mit CORS + optionalem Turnstile
2. `POST /api/v1/content-sync` — API-Key gesichert, empfängt Posts von externen Sites
3. `POST /api/v1/webhooks/resend` — Svix-verifiziert
4. `GET/POST /api/admin/newsletter` — Auth-geschützt, Newsletter CRUD + Send
5. `GET/POST /api/admin/automations` — Auth-geschützt
6. `GET /api/admin/newsletter-trends` — Analytics
7. `GET /api/cron/automation-processor` — CRON_SECRET gesichert

### Schritt 7: User-facing Pages (Astro → Next.js)
**Dateien:** `app/newsletter/bestaetigen/page.tsx`, etc.

- Astro server-side logic → Next.js Server Components mit `searchParams` (async!)
- `bestaetigen`: Token validieren, Welcome-Mail senden, Automation enrollen, redirect
- `bestaetigt`: Erfolgs-Seite (statisch)
- `abgemeldet`: Abmeldungs-Bestätigung (statisch)
- `unsubscribe`: Token validieren, abmelden, redirect

### Schritt 8: Admin UI
**Dateien:** `components/AdminNewsletter.tsx`, `components/AutomationEditor.tsx`, `app/admin/newsletter/page.tsx`

- Kopie der React-Komponenten (bereits TSX, minimaler Aufwand)
- `'use client'` Directive hinzufügen
- API-Pfade anpassen (`/api/admin/newsletter` → gleich)
- `getCollection('posts')` Referenzen → `/api/admin/newsletter?posts=1` liefert jetzt `content_items`
- Hardcoded URLs (kokomo.house) → dynamisch aus API

### Schritt 9: CORS Proxy
**Datei:** `proxy.ts` (Next.js 16: middleware → proxy)

- CORS-Headers für konfigurierte Origins (`ALLOWED_ORIGINS`)
- Nur auf `/api/v1/*` Routes anwenden

### Schritt 10: ENV + Build verifizieren

**ENV-Variablen:**
```
TURSO_DB_URL=libsql://newsletter-xxx.turso.io
TURSO_DB_TOKEN=...
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
ADMIN_PASSWORD=...
SITE_URL=https://newsletter.kokomo.house
ALLOWED_ORIGINS=https://www.kokomo.house
CRON_SECRET=...
TURNSTILE_SECRET_KEY=...  (optional)
```

---

## Reihenfolge der Implementation

| # | Was | Abhängigkeiten |
|---|-----|----------------|
| 1 | `lib/db.ts` + `scripts/migrate.ts` | — |
| 2 | `lib/newsletter-blocks.ts` + `lib/content.ts` | db.ts |
| 3 | `lib/newsletter.ts` (portiert) | db.ts |
| 4 | `lib/site-config.ts` | db.ts |
| 5 | `lib/newsletter-template.ts` (portiert) | site-config, blocks |
| 6 | `lib/notify.ts` (nur Newsletter) | template, site-config |
| 7 | `lib/automation.ts` (portiert) | db.ts |
| 8 | `lib/admin-auth.ts` | — |
| 9 | API: `/api/v1/subscribe` | newsletter, notify, auth |
| 10 | API: `/api/v1/content-sync` | content |
| 11 | API: `/api/v1/webhooks/resend` | newsletter, automation |
| 12 | API: `/api/admin/login` | admin-auth |
| 13 | API: `/api/admin/newsletter` | newsletter, notify, content |
| 14 | API: `/api/admin/automations` | automation, notify |
| 15 | API: `/api/admin/newsletter-trends` | newsletter |
| 16 | API: `/api/cron/automation-processor` | automation, notify, content |
| 17 | Pages: bestaetigen, bestaetigt, abgemeldet, unsubscribe | newsletter, notify, automation |
| 18 | Admin UI: AdminNewsletter + AutomationEditor | alle APIs |
| 19 | `proxy.ts` (CORS) | — |
| 20 | Build + Smoke Test | alles |

---

## Verification

1. **`npm run build`** — Fehlerfrei durchlaufen
2. **Subscribe Flow:** POST `/api/v1/subscribe` mit Email → Bestätigungs-Mail prüfen
3. **Content Sync:** POST `/api/v1/content-sync` mit Test-Posts → DB prüfen
4. **Admin Login:** POST `/api/admin/login` → Cookie gesetzt
5. **Admin Newsletter:** GET `/api/admin/newsletter` → Subscribers + Content Items
6. **Webhook:** POST `/api/v1/webhooks/resend` mit Test-Event → DB-Update prüfen
7. **Full Send:** Admin → Newsletter erstellen → Test-Send → Empfang prüfen
