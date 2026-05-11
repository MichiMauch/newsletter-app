'use client'

import React, { useState, useEffect, useCallback, useTransition } from 'react'
import AutomationEditor from './AutomationEditor'
import DashboardTab from './admin/DashboardTab'
import SubscribersTab from './admin/SubscribersTab'
import ListsTab from './admin/ListsTab'
import SettingsTab from './admin/SettingsTab'
import HistoryTab from './admin/HistoryTab'
import BouncesTab from './admin/BouncesTab'
import EmailTemplatesTab from './admin/EmailTemplatesTab'
import LoginForm from './admin/LoginForm'
import { useToast } from './ui/ToastProvider'
import StatusPill from './ui/StatusPill'
import AiCopilot from './ui/AiCopilot'
import EngagementTrendChart from './admin/charts/EngagementTrendChart'
import SubscriberGrowthChart from './admin/charts/SubscriberGrowthChart'
import { PREVIEW_SITE_CONFIG } from '@/emails/_preview-data'
import {
  type Subscriber,
  type NewsletterSend,
  type OverallStatsData,
  type Post,
  type SendTrend,
  type SubscriberGrowth,
  type Tab,
  type SendSubTab,
} from './admin/types'
import { tabToHref, pathToTab } from './admin/routing'
import AdminSidebar from './admin/AdminSidebar'
import { useDataLoader } from '@/hooks/useDataLoader'
import SendCenterNav from './admin/send/SendCenterNav'
import ReadyToSendList from './admin/send/ReadyToSendList'
import DraftList from './admin/compose/DraftList'


// --- Trend Charts ------------------------------------------------------

export default function AdminNewsletter({ initialTab = 'dashboard', initialSubTab = 'list', automationId }: { initialTab?: Tab; initialSubTab?: SendSubTab; automationId?: number } = {}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [sendSubTab, setSendSubTab] = useState<SendSubTab>(initialSubTab)
  // Heavy tabs (Automations editor, History charts) used to block the click-
  // to-render transition long enough that the sidebar appeared frozen until
  // the user reloaded. We mark the actual setTab inside startTransition so
  // React keeps the previous tab interactive while it prepares the next one;
  // pendingTab carries the user's *intent* synchronously so the sidebar
  // highlights and shows a spinner the moment the click registers.
  const [pendingTabRaw, setPendingTabRaw] = useState<Tab | null>(null)
  const [pendingSubTabRaw, setPendingSubTabRaw] = useState<SendSubTab | null>(null)
  const [isPendingNav, startNavTransition] = useTransition()
  // Only expose the pending value while the transition is actually running.
  // When isPendingNav flips back to false, the stale state still sits in the
  // raw setters but is hidden from props — avoids a setState-in-effect.
  const pendingTab = isPendingNav ? pendingTabRaw : null
  const pendingSubTab = isPendingNav ? pendingSubTabRaw : null

  const {
    phase, setPhase,
    subscribers,
    sends,
    posts,
    sendTrends,
    subscriberGrowth,
    overallStats,
    loadData,
    loadTrends,
    streamingSend,
  } = useDataLoader()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('newsletter-dark-mode') === 'true'
  })

  useEffect(() => {
    const handlePopState = () => {
      const next = pathToTab(window.location.pathname)
      setTab(next.tab)
      setSendSubTab(next.subTab)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Sync the <html> class with state. Effect-only side-effect (DOM mutation),
  // no setState — keeps lint happy.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev
      localStorage.setItem('newsletter-dark-mode', String(next))
      return next
    })
  }, [])

  const toast = useToast()
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)

  const [automationFullscreen, setAutomationFullscreen] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)

  const confirmedCount = subscribers.filter((s) => s.status === 'confirmed').length

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const isHistory = tab === 'send' && sendSubTab === 'history'
    if ((isHistory || tab === 'dashboard') && sendTrends.length === 0) {
      loadTrends()
    }
  }, [tab, sendSubTab, sendTrends.length, loadTrends])

  // Compose-Workflow lebt in /admin/newsletter/compose (eigene Routen). Der
  // Send-Bereich verteilt jetzt nur noch fertige Drafts — kein localer
  // useComposeState mehr im AdminNewsletter-Shell.
  const setTabWithUrl = useCallback((newTab: Tab, newSubTab: SendSubTab = 'list') => {
    setPendingTabRaw(newTab)
    if (newTab === 'send') setPendingSubTabRaw(newSubTab)
    window.history.pushState(null, '', tabToHref(newTab, newSubTab))
    setAutomationFullscreen(false)
    startNavTransition(() => {
      setTab(newTab)
      if (newTab === 'send') setSendSubTab(newSubTab)
    })
  }, [])
  const setSendSubTabWithUrl = useCallback((sub: SendSubTab) => {
    setPendingSubTabRaw(sub)
    window.history.pushState(null, '', tabToHref('send', sub))
    startNavTransition(() => {
      setSendSubTab(sub)
    })
  }, [])

  if (phase === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-primary-500" />
          <p className="text-sm text-[var(--text-muted)]">Laden…</p>
        </div>
      </div>
    )
  }

  if (phase === 'login') {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoginForm onLogin={loadData} />
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      <AdminSidebar
        tab={tab}
        pendingTab={pendingTab}
        onTabChange={(t) => setTabWithUrl(t)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        copilotOpen={copilotOpen}
        onToggleCopilot={() => setCopilotOpen((o) => !o)}
        showCopilot={!automationFullscreen}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* ── Main Content ─────────────────────────────── */}
      <div className={`flex-1 ${automationFullscreen ? '' : 'overflow-y-auto'}`}>
        {/* Automation fullscreen — no container constraints */}
        {automationFullscreen && tab === 'automations' && (
          <AutomationEditor siteConfig={PREVIEW_SITE_CONFIG} posts={posts.map(p => ({ slug: p.slug, title: p.title, summary: p.summary, image: p.image, date: p.date }))} onFullscreen={setAutomationFullscreen} initialAutomationId={automationId} />
        )}

        <div className={`mx-auto max-w-[1100px] space-y-6 p-6 ${automationFullscreen ? 'hidden' : ''}`}>
      <div className="flex justify-end">
        <StatusPill />
      </div>
      {/* --- Dashboard Tab ----------------------------------------- */}
      {tab === 'dashboard' && (
        <DashboardTab
          subscribers={subscribers}
          sends={sends}
          overallStats={overallStats}
          subscriberGrowth={subscriberGrowth}
          sendTrends={sendTrends}
          setTab={setTabWithUrl}

          EngagementTrendChart={EngagementTrendChart}
          SubscriberGrowthChart={SubscriberGrowthChart}
        />
      )}

      {/* --- Compose Tab — Draft-Liste ---------------------------- */}
      {tab === 'compose' && (
        <DraftList />
      )}

      {/* --- Send Center: sub-nav -------------------------------- */}
      {tab === 'send' && (
        <SendCenterNav active={sendSubTab} pending={pendingSubTab} onChange={setSendSubTabWithUrl} />
      )}

      {/* --- Send Center › Bereit zum Senden --------------------- */}
      {tab === 'send' && sendSubTab === 'list' && (
        <ReadyToSendList />
      )}

      {/* AI Co-Pilot — controlled by sidebar trigger */}
      {!automationFullscreen && (
        <AiCopilot
          open={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          context={
            tab === 'dashboard' ? 'dashboard'
              : tab === 'subscribers' ? 'subscribers'
                : 'other'
          }
        />
      )}

      {/* --- Subscribers Tab --------------------------------------- */}
      {tab === 'subscribers' && (
        <SubscribersTab
          subscribers={subscribers}
          setConfirmAction={setConfirmAction}
          loadData={loadData}
        />
      )}

      {/* --- Lists Tab ---------------------------------------------- */}
      {tab === 'lists' && (
        <ListsTab />
      )}

      {/* --- Send Center › Historie ------------------------------ */}
      {tab === 'send' && sendSubTab === 'history' && (
        <HistoryTab
          sends={sends}
          posts={posts}
          sendTrends={sendTrends}
          subscriberGrowth={subscriberGrowth}
          overallStats={overallStats}
          siteConfig={PREVIEW_SITE_CONFIG}
          loadData={loadData}
          streamingSend={streamingSend}
        />
      )}

      {/* --- Send Center › Probleme ------------------------------ */}
      {tab === 'send' && sendSubTab === 'bounces' && (
        <BouncesTab />
      )}

      {/* --- Settings Tab ------------------------------------------ */}
      {tab === 'settings' && (
        <SettingsTab />
      )}

      {/* --- Automations Tab (non-fullscreen = list view) --------- */}
      {tab === 'automations' && !automationFullscreen && (
        <AutomationEditor siteConfig={PREVIEW_SITE_CONFIG} posts={posts.map(p => ({ slug: p.slug, title: p.title, summary: p.summary, image: p.image, date: p.date }))} onFullscreen={setAutomationFullscreen} initialAutomationId={automationId} />
      )}

      {/* --- Email Templates Tab --------------------------------- */}
      {tab === 'emails' && (
        <EmailTemplatesTab />
      )}


      {/* --- Generic Confirm Modal ------------------------------ */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl backdrop-blur-xl">
            <h3 className="mb-3 text-lg font-semibold text-[var(--text)]">{confirmAction.title}</h3>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">{confirmAction.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="glass-button"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className="rounded-xl bg-red-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

        </div>{/* /max-w content */}
      </div>{/* /overflow-y-auto */}
    </div>
  )
}
