'use client'

import type { Tab } from './types'
import { tabToHref } from './routing'
import { useToast } from '../ui/ToastProvider'

const ICON_DASHBOARD = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
)
const ICON_SEND = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
)
const ICON_SUBSCRIBERS = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.16V17a6.003 6.003 0 017.654-5.77M12 15.07a5.98 5.98 0 00-1.654-.76M15 19.128H5.228A2 2 0 013 17.16V17" />
  </svg>
)
const ICON_LISTS = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
  </svg>
)
const ICON_AUTOMATION = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>
)
const ICON_TEMPLATES = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
)
const ICON_SETTINGS = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const ICON_COPILOT = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
)
const ICON_ACTIVITY = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const ICON_DARK = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
  </svg>
)
const ICON_LIGHT = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
  </svg>
)

type SidebarItem = { id: Tab; label: string; icon: React.ReactNode }
type SidebarGroup = { label: string | null; items: SidebarItem[] }

const SIDEBAR_GROUPS: SidebarGroup[] = [
  { label: null, items: [{ id: 'dashboard', label: 'Dashboard', icon: ICON_DASHBOARD }] },
  { label: 'Senden', items: [{ id: 'send', label: 'Send Center', icon: ICON_SEND }] },
  {
    label: 'Audience',
    items: [
      { id: 'subscribers', label: 'Abonnenten', icon: ICON_SUBSCRIBERS },
      { id: 'lists', label: 'Listen', icon: ICON_LISTS },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'automations', label: 'Automation', icon: ICON_AUTOMATION },
      { id: 'emails', label: 'Templates', icon: ICON_TEMPLATES },
      { id: 'settings', label: 'Settings', icon: ICON_SETTINGS },
    ],
  },
]

interface AdminSidebarProps {
  tab: Tab
  // The tab the user just clicked, while the heavy re-render is still in
  // flight. Drives the active highlight + spinner so the click feels
  // instantaneous even when the destination tab takes a moment to mount.
  pendingTab?: Tab | null
  onTabChange: (tab: Tab) => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
  copilotOpen: boolean
  onToggleCopilot: () => void
  showCopilot: boolean
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function AdminSidebar({
  tab,
  pendingTab = null,
  onTabChange,
  sidebarOpen,
  onToggleSidebar,
  copilotOpen,
  onToggleCopilot,
  showCopilot,
  darkMode,
  onToggleDarkMode,
}: AdminSidebarProps) {
  const toast = useToast()

  const bottomBtnStyle: React.CSSProperties = {
    width: sidebarOpen ? '100%' : 40,
    justifyContent: sidebarOpen ? 'flex-start' : 'center',
    padding: sidebarOpen ? '0 12px' : 0,
    gap: sidebarOpen ? 10 : 0,
  }

  return (
    <nav className={`glass-sidebar flex shrink-0 flex-col py-4 ${sidebarOpen ? 'expanded' : ''}`} style={{ width: sidebarOpen ? 180 : 56 }}>
      <button
        onClick={onToggleSidebar}
        style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', background: 'none', border: 'none', cursor: 'pointer', margin: '0 auto 20px', transition: 'color 0.1s' }}
        title={sidebarOpen ? 'Sidebar einklappen' : 'Sidebar ausklappen'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          {sidebarOpen
            ? <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            : <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 8px' }}>
        {SIDEBAR_GROUPS.map((group, gIdx) => (
          <div key={group.label ?? `group-${gIdx}`} className="flex flex-col gap-0.5">
            {group.label && (
              sidebarOpen ? (
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {group.label}
                </div>
              ) : (
                gIdx > 0 && <div className="mx-2 mb-1 mt-1 h-px bg-[var(--border)]/40" aria-hidden />
              )
            )}
            {group.items.map((item) => {
              const effective = pendingTab ?? tab
              const isActive = effective === item.id
              const isLoading = pendingTab === item.id
              return (
                <a
                  key={item.id}
                  href={tabToHref(item.id)}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.button === 1) return
                    e.preventDefault()
                    onTabChange(item.id)
                  }}
                  className={`sidebar-icon${isActive ? ' active' : ''}${isLoading ? ' is-loading' : ''}`}
                  title={!sidebarOpen ? item.label : undefined}
                  aria-busy={isLoading || undefined}
                >
                  {isLoading ? (
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    item.icon
                  )}
                  <span className="sidebar-label">{item.label}</span>
                </a>
              )
            })}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'auto', padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {showCopilot && (
          <button
            onClick={onToggleCopilot}
            className={`sidebar-icon${copilotOpen ? ' active' : ''}`}
            title="AI Co-Pilot"
            style={bottomBtnStyle}
          >
            {ICON_COPILOT}
            {sidebarOpen && <span className="sidebar-label" style={{ display: 'block', opacity: 1 }}>Co-Pilot</span>}
          </button>
        )}

        <button
          onClick={toast.toggleActivity}
          className={`sidebar-icon${toast.isActivityOpen ? ' active' : ''}`}
          title="Aktivitätslog"
          style={{ ...bottomBtnStyle, position: 'relative' }}
        >
          {ICON_ACTIVITY}
          {sidebarOpen && <span className="sidebar-label" style={{ display: 'block', opacity: 1 }}>Aktivität</span>}
          {toast.activityCount > 0 && (
            <span
              aria-label={`${toast.activityCount} Einträge`}
              style={{
                position: 'absolute',
                top: 4,
                right: sidebarOpen ? 8 : 4,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                fontSize: 10,
                fontWeight: 600,
                lineHeight: '16px',
                textAlign: 'center',
                background: 'var(--color-primary)',
                color: 'white',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {toast.activityCount > 99 ? '99+' : toast.activityCount}
            </span>
          )}
        </button>

        <button
          onClick={onToggleDarkMode}
          className="sidebar-icon"
          title={darkMode ? 'Light Mode' : 'Dark Mode'}
          style={bottomBtnStyle}
        >
          {darkMode ? ICON_LIGHT : ICON_DARK}
          {sidebarOpen && <span className="sidebar-label" style={{ display: 'block', opacity: 1 }}>{darkMode ? 'Light' : 'Dark'}</span>}
        </button>
      </div>
    </nav>
  )
}
