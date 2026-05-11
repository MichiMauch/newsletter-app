import type { Tab, SendSubTab } from './types'

const TOP_LEVEL_TABS: Tab[] = ['compose', 'subscribers', 'lists', 'settings', 'automations', 'emails']
const SEND_SUB_TABS: SendSubTab[] = ['list', 'history', 'bounces']

export function tabToHref(tab: Tab, subTab: SendSubTab = 'list'): string {
  if (tab === 'dashboard') return '/admin/newsletter'
  if (tab === 'send') return subTab === 'list' ? '/admin/newsletter/send' : `/admin/newsletter/send/${subTab}`
  return `/admin/newsletter/${tab}`
}

export function pathToTab(pathname: string): { tab: Tab; subTab: SendSubTab } {
  const segments = pathname.replace('/admin/newsletter', '').replace(/^\//, '').split('/').filter(Boolean)
  const first = segments[0]
  if (!first) return { tab: 'dashboard', subTab: 'list' }
  if (first === 'send') {
    const sub = segments[1] as SendSubTab | undefined
    return { tab: 'send', subTab: sub && SEND_SUB_TABS.includes(sub) ? sub : 'list' }
  }
  if (TOP_LEVEL_TABS.includes(first as Tab)) return { tab: first as Tab, subTab: 'list' }
  return { tab: 'dashboard', subTab: 'list' }
}
