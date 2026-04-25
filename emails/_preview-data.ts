import type { SiteConfig } from '@/lib/site-config'

export const PREVIEW_SITE_CONFIG: SiteConfig = {
  id: 'preview',
  name: 'Newsletter',
  site_url: 'https://preview.localhost',
  logo_url: null,
  primary_color: '#017734',
  accent_color: '#05DE66',
  gradient_end: '#01ABE7',
  font_family: 'Poppins',
  from_email: 'noreply@example.com',
  from_name: 'Newsletter',
  footer_text: null,
  social_links: {},
  allowed_origin: '',
  turnstile_site_key: null,
  locale: 'de-CH',
}
