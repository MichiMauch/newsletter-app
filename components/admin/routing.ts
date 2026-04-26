import type { Tab, SendSubTab } from './types'

const TOP_LEVEL_TABS: Tab[] = ['subscribers', 'lists', 'settings', 'automations', 'emails']
const SEND_SUB_TABS: SendSubTab[] = ['compose', 'history', 'bounces']

export function tabToHref(tab: Tab, subTab: SendSubTab = 'compose'): string {
  if (tab === 'dashboard') return '/admin/newsletter'
  if (tab === 'send') return subTab === 'compose' ? '/admin/newsletter/send' : `/admin/newsletter/send/${subTab}`
  return `/admin/newsletter/${tab}`
}

export function pathToTab(pathname: string): { tab: Tab; subTab: SendSubTab } {
  const segments = pathname.replace('/admin/newsletter', '').replace(/^\//, '').split('/').filter(Boolean)
  const first = segments[0]
  if (!first) return { tab: 'dashboard', subTab: 'compose' }
  if (first === 'send') {
    const sub = segments[1] as SendSubTab | undefined
    return { tab: 'send', subTab: sub && SEND_SUB_TABS.includes(sub) ? sub : 'compose' }
  }
  if (TOP_LEVEL_TABS.includes(first as Tab)) return { tab: first as Tab, subTab: 'compose' }
  return { tab: 'dashboard', subTab: 'compose' }
}
