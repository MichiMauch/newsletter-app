import type { NewsletterTemplate } from './newsletter-blocks'
import type { NewsletterDraft } from '@/components/admin/types'

const STORAGE_KEY = 'newsletter-templates'
const DRAFTS_KEY = 'newsletter-drafts'

export function loadCustomTemplates(): NewsletterTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveCustomTemplates(templates: NewsletterTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

export function loadDrafts(): NewsletterDraft[] {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveDrafts(drafts: NewsletterDraft[]): void {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}
