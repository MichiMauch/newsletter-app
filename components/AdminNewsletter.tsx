'use client'

import React, { useState, useEffect, useCallback } from 'react'
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
import { buildMultiBlockNewsletterHtml } from '@/lib/newsletter-template'
import {
  blocksAreValid,
  buildPostsMap,
  parseScheduleLocal,
} from '@/lib/newsletter-block-helpers'
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
import ConfirmSendModal from './admin/send/ConfirmSendModal'
import TestSendModal from './admin/send/TestSendModal'
import SubjectPickerModal from './admin/send/SubjectPickerModal'
import { useComposeState } from '@/hooks/useComposeState'
import { useDataLoader } from '@/hooks/useDataLoader'
import SendCenterNav from './admin/send/SendCenterNav'
import PreviewModal from './admin/send/PreviewModal'
import NewsletterStudio from './admin/send/NewsletterStudio'
import ComposeWizard from './admin/send/ComposeWizard'


// --- Trend Charts ------------------------------------------------------

export default function AdminNewsletter({ initialTab = 'dashboard', initialSubTab = 'compose', automationId }: { initialTab?: Tab; initialSubTab?: SendSubTab; automationId?: number } = {}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [sendSubTab, setSendSubTab] = useState<SendSubTab>(initialSubTab)
  const setTabWithUrl = useCallback((newTab: Tab, newSubTab: SendSubTab = 'compose') => {
    setTab(newTab)
    if (newTab === 'send') setSendSubTab(newSubTab)
    window.history.pushState(null, '', tabToHref(newTab, newSubTab))
  }, [])
  const setSendSubTabWithUrl = useCallback((sub: SendSubTab) => {
    setSendSubTab(sub)
    window.history.pushState(null, '', tabToHref('send', sub))
  }, [])

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

  const compose = useComposeState({
    posts,
    confirmedCount,
    tab,
    sendSubTab,
    toast,
    setConfirmAction,
    streamingSend,
    loadData,
  })
  // Only destructure what AdminNewsletter itself uses outside of <ComposeWizard />.
  // Everything else flows through `compose` directly.
  const {
    composeMode,
    blocks,
    subject, setSubject,
    preheader, setPreheader,
    abTestEnabled, setAbTestEnabled,
    subjectVariantB, setSubjectVariantB,
    subjectPickerTarget,
    generatingSubject,
    subjectOptions,
    showSubjectPicker, setShowSubjectPicker,
    audienceFilter,
    showPreview, setShowPreview,
    confirmSend, setConfirmSend,
    showTestSend, setShowTestSend,
    testEmail, setTestEmail,
    useSto,
    scheduleMode, scheduleLocal,
    audienceCount,
    studioMode, setStudioMode,
    studioViewport, setStudioViewport,
    generateSubject,
    updateBlock,
    removeBlock,
    moveBlock,
    insertBlock,
    handleTestSendConfirmed,
    handleSendConfirmed,
  } = compose

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

  const postsMap = buildPostsMap(blocks, posts)

  return (
    <div className="flex h-screen">
      <AdminSidebar
        tab={tab}
        onTabChange={(t) => setTabWithUrl(t)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        copilotOpen={copilotOpen}
        onToggleCopilot={() => setCopilotOpen((o) => !o)}
        showCopilot={!automationFullscreen && !studioMode}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* ── Main Content ─────────────────────────────── */}
      <div className={`flex-1 ${automationFullscreen || studioMode ? '' : 'overflow-y-auto'}`}>
        {/* Automation fullscreen — no container constraints */}
        {automationFullscreen && tab === 'automations' && (
          <AutomationEditor siteConfig={PREVIEW_SITE_CONFIG} posts={posts.map(p => ({ slug: p.slug, title: p.title, summary: p.summary, image: p.image, date: p.date }))} onFullscreen={setAutomationFullscreen} initialAutomationId={automationId} />
        )}

        {/* Studio fullscreen — replaces compose step 2 with editor + live preview */}
        {studioMode && tab === 'send' && sendSubTab === 'compose' && composeMode === 'fill-slots' && (
          <NewsletterStudio
            subject={subject}
            onSubjectChange={setSubject}
            preheader={preheader}
            onPreheaderChange={setPreheader}
            abTestEnabled={abTestEnabled}
            onAbTestEnabledChange={setAbTestEnabled}
            subjectVariantB={subjectVariantB}
            onSubjectVariantBChange={setSubjectVariantB}
            generatingSubject={generatingSubject}
            onGenerateSubject={generateSubject}
            blocks={blocks}
            onUpdateBlock={updateBlock}
            onRemoveBlock={removeBlock}
            onMoveBlock={moveBlock}
            onInsertBlock={insertBlock}
            posts={posts}
            postsMap={postsMap}
            siteConfig={PREVIEW_SITE_CONFIG}
            viewport={studioViewport}
            onViewportChange={setStudioViewport}
            onExit={() => setStudioMode(false)}
          />
        )}

        <div className={`mx-auto max-w-[1100px] space-y-6 p-6 ${automationFullscreen || studioMode ? 'hidden' : ''}`}>
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

      {/* --- Send Center: sub-nav -------------------------------- */}
      {tab === 'send' && (
        <SendCenterNav active={sendSubTab} onChange={setSendSubTabWithUrl} />
      )}

      {/* --- Send Center › Compose ------------------------------- */}
      {tab === 'send' && sendSubTab === 'compose' && (
        <ComposeWizard
          compose={compose}
          posts={posts}
          toast={toast}
          loadData={loadData}
          setConfirmAction={setConfirmAction}
        />
      )}

      {/* Preview Modal */}
      {showPreview && blocksAreValid(blocks) && (
        <PreviewModal
          html={buildMultiBlockNewsletterHtml(PREVIEW_SITE_CONFIG, blocks, postsMap, '#', preheader || null)}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* AI Co-Pilot — controlled by sidebar trigger */}
      {!automationFullscreen && !studioMode && (
        <AiCopilot
          open={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          context={
            tab === 'dashboard' ? 'dashboard'
              : tab === 'subscribers' ? 'subscribers'
                : tab === 'send' && sendSubTab === 'compose' ? 'compose'
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


      {confirmSend && (
        <ConfirmSendModal
          subject={subject}
          audienceCount={audienceCount}
          audienceFilter={audienceFilter}
          scheduledDate={scheduleMode === 'scheduled' ? parseScheduleLocal(scheduleLocal) : null}
          useSto={useSto}
          onCancel={() => setConfirmSend(false)}
          onConfirm={handleSendConfirmed}
        />
      )}

      {showTestSend && (
        <TestSendModal
          subject={subject}
          testEmail={testEmail}
          onTestEmailChange={setTestEmail}
          onCancel={() => setShowTestSend(false)}
          onConfirm={handleTestSendConfirmed}
        />
      )}

      {showSubjectPicker && (
        <SubjectPickerModal
          options={subjectOptions}
          generating={generatingSubject}
          canRegenerate={blocks.length > 0}
          target={subjectPickerTarget}
          onSelect={(s) => {
            if (subjectPickerTarget === 'b') setSubjectVariantB(s)
            else setSubject(s)
            setShowSubjectPicker(false)
          }}
          onRegenerate={() => generateSubject(subjectPickerTarget)}
          onClose={() => setShowSubjectPicker(false)}
        />
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
