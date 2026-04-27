'use client'

import React from 'react'
import { BUILT_IN_TEMPLATES } from '@/lib/newsletter-blocks'
import {
  blocksAreValid,
  defaultScheduleValue,
  getUsedSlugs,
} from '@/lib/newsletter-block-helpers'
import type { useToast } from '@/components/ui/ToastProvider'
import {
  formatDate,
  inputCls,
  type ConfirmActionState,
  type Post,
} from '../types'
import type { useComposeState } from '@/hooks/useComposeState'
import WizardStepper from './WizardStepper'
import TemplateCard from './TemplateCard'
import TemplateBuilder from './TemplateBuilder'
import EngagementPanel from './EngagementPanel'
import InsertToolbar from './InsertToolbar'
import { DraggablePostItem, SlotCard } from './DragDropSlots'

type ComposeApi = ReturnType<typeof useComposeState>

interface ComposeWizardProps {
  compose: ComposeApi
  posts: Post[]
  toast: ReturnType<typeof useToast>
  loadData: () => void | Promise<void>
  setConfirmAction: (action: ConfirmActionState) => void
}

export default function ComposeWizard({ compose, posts, toast, loadData, setConfirmAction }: ComposeWizardProps) {
  const {
    composeMode, setComposeMode,
    composeStep, setComposeStep,
    selectedTemplate,
    blocks,
    subject, setSubject,
    preheader, setPreheader,
    abTestEnabled, setAbTestEnabled,
    subjectVariantB, setSubjectVariantB,
    generatingSubject,
    audienceFilter, setAudienceFilter,
    sending,
    setShowPreview,
    customTemplates,
    drafts,
    setShowTestSend,
    useSto, setUseSto,
    scheduleMode, setScheduleMode,
    scheduleLocal, setScheduleLocal,
    availableLists,
    selectedListId, setSelectedListId,
    setStudioMode,
    selectedList,
    audienceCount,
    canSend,
    selectTemplate,
    goBackToPicker,
    generateSubject,
    updateBlock,
    removeBlock,
    moveBlock,
    insertBlock,
    handleSaveCustomTemplate,
    handleDeleteCustomTemplate,
    handleSaveDraft,
    handleLoadDraft,
    handleDeleteDraft,
    handleSendClick,
  } = compose

  const stepIndex: 0 | 1 | 2 | 3 =
    composeMode === 'pick-template' ? 0
      : composeStep === 'content' ? 1
        : composeStep === 'audience' ? 2
          : 3
  const contentReady = subject.trim() !== '' && blocksAreValid(blocks)
  const audienceReady = true

  const handleStepClick = (next: 0 | 1 | 2 | 3) => {
    if (next === 0) {
      if (composeMode === 'fill-slots') {
        setConfirmAction({
          title: 'Anderes Template wählen',
          message: 'Inhalt geht verloren. Speichere vorher als Entwurf, wenn du ihn behalten willst.',
          onConfirm: () => { setConfirmAction(null); goBackToPicker() },
        })
      } else {
        goBackToPicker()
      }
      return
    }
    if (composeMode !== 'fill-slots') return
    if (next === 1) setComposeStep('content')
    else if (next === 2) setComposeStep('audience')
    else if (next === 3) setComposeStep('review')
  }

  return (
    <div className="glass-card space-y-5 rounded-xl p-6">
      {composeMode !== 'build-template' && (
        <WizardStepper
          currentStep={stepIndex}
          onStepClick={handleStepClick}
          contentReady={contentReady}
          audienceReady={audienceReady}
        />
      )}

      {/* Resume-Draft banner (only when picker is shown) */}
      {composeMode === 'pick-template' && drafts.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Weitermachen?
            </span>
            <span className="text-[10px] text-amber-700/70 dark:text-amber-300/70">
              {drafts.length} Entwurf{drafts.length === 1 ? '' : 'e'}
            </span>
          </div>
          <div className="space-y-1.5">
            {drafts.slice(0, 3).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2">
                <button
                  onClick={() => handleLoadDraft(d)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-[var(--text)]">{d.subject || 'Ohne Betreff'}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    {d.blocks.length} Block{d.blocks.length === 1 ? '' : 'e'} · {formatDate(d.savedAt)}
                  </div>
                </button>
                <button
                  onClick={() => handleDeleteDraft(d.id)}
                  className="text-[10px] text-amber-700/80 transition-colors hover:text-red-600 dark:text-amber-300/80"
                >
                  Verwerfen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Pick Template */}
      {composeMode === 'pick-template' && (
        <div className="space-y-6">
          <div>
            <label className="mb-3 block text-sm font-medium text-[var(--text)]">Template wählen</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BUILT_IN_TEMPLATES.map((t) => (
                <TemplateCard key={t.id} template={t} onSelect={() => selectTemplate(t)} />
              ))}
            </div>
          </div>

          {(customTemplates.length > 0) && (
            <div>
              <div className="mb-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--border)]" />
                <span className="text-xs font-medium text-[var(--text-secondary)]">Eigene Templates</span>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {customTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onSelect={() => selectTemplate(t)}
                    onDelete={() => handleDeleteCustomTemplate(t.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setComposeMode('build-template')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-4 py-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50/50 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
          >
            <span className="text-lg">+</span> Neues Template erstellen
          </button>
        </div>
      )}

      {/* Mode: Build Template */}
      {composeMode === 'build-template' && (
        <TemplateBuilder
          onSave={handleSaveCustomTemplate}
          onCancel={() => setComposeMode('pick-template')}
        />
      )}

      {/* Mode: Fill Slots */}
      {composeMode === 'fill-slots' && selectedTemplate && (
        <FillSlotsView
          stepIndex={stepIndex}
          contentReady={contentReady}
          composeStep={composeStep}
          setComposeStep={setComposeStep}
          selectedTemplateName={selectedTemplate.name}
          subject={subject}
          setSubject={setSubject}
          preheader={preheader}
          setPreheader={setPreheader}
          abTestEnabled={abTestEnabled}
          setAbTestEnabled={setAbTestEnabled}
          subjectVariantB={subjectVariantB}
          setSubjectVariantB={setSubjectVariantB}
          generatingSubject={generatingSubject}
          generateSubject={generateSubject}
          blocks={blocks}
          posts={posts}
          updateBlock={updateBlock}
          removeBlock={removeBlock}
          moveBlock={moveBlock}
          insertBlock={insertBlock}
          audienceFilter={audienceFilter}
          setAudienceFilter={setAudienceFilter}
          availableLists={availableLists}
          selectedListId={selectedListId}
          setSelectedListId={setSelectedListId}
          selectedList={selectedList}
          audienceCount={audienceCount}
          canSend={canSend}
          sending={sending}
          useSto={useSto}
          setUseSto={setUseSto}
          scheduleMode={scheduleMode}
          setScheduleMode={setScheduleMode}
          scheduleLocal={scheduleLocal}
          setScheduleLocal={setScheduleLocal}
          setShowPreview={setShowPreview}
          setShowTestSend={setShowTestSend}
          setStudioMode={setStudioMode}
          handleSaveDraft={handleSaveDraft}
          handleSendClick={handleSendClick}
          handleStepClick={handleStepClick}
          toast={toast}
          loadData={loadData}
        />
      )}
    </div>
  )
}

interface FillSlotsViewProps {
  stepIndex: 0 | 1 | 2 | 3
  contentReady: boolean
  composeStep: ComposeApi['composeStep']
  setComposeStep: ComposeApi['setComposeStep']
  selectedTemplateName: string
  subject: string
  setSubject: (s: string) => void
  preheader: string
  setPreheader: (s: string) => void
  abTestEnabled: boolean
  setAbTestEnabled: (v: boolean) => void
  subjectVariantB: string
  setSubjectVariantB: (s: string) => void
  generatingSubject: boolean
  generateSubject: (target?: 'a' | 'b') => void
  blocks: ComposeApi['blocks']
  posts: Post[]
  updateBlock: ComposeApi['updateBlock']
  removeBlock: ComposeApi['removeBlock']
  moveBlock: ComposeApi['moveBlock']
  insertBlock: ComposeApi['insertBlock']
  audienceFilter: ComposeApi['audienceFilter']
  setAudienceFilter: ComposeApi['setAudienceFilter']
  availableLists: ComposeApi['availableLists']
  selectedListId: ComposeApi['selectedListId']
  setSelectedListId: ComposeApi['setSelectedListId']
  selectedList: ComposeApi['selectedList']
  audienceCount: number
  canSend: boolean
  sending: boolean
  useSto: boolean
  setUseSto: (v: boolean) => void
  scheduleMode: ComposeApi['scheduleMode']
  setScheduleMode: ComposeApi['setScheduleMode']
  scheduleLocal: string
  setScheduleLocal: (v: string) => void
  setShowPreview: (v: boolean) => void
  setShowTestSend: (v: boolean) => void
  setStudioMode: (v: boolean) => void
  handleSaveDraft: () => void
  handleSendClick: () => void
  handleStepClick: (next: 0 | 1 | 2 | 3) => void
  toast: ReturnType<typeof useToast>
  loadData: () => void | Promise<void>
}

const PREHEADER_MAX = 200

function FillSlotsView({
  stepIndex, contentReady, composeStep, setComposeStep,
  selectedTemplateName, subject, setSubject, preheader, setPreheader,
  abTestEnabled, setAbTestEnabled, subjectVariantB, setSubjectVariantB,
  generatingSubject, generateSubject,
  blocks, posts, updateBlock, removeBlock, moveBlock, insertBlock,
  audienceFilter, setAudienceFilter,
  availableLists, selectedListId, setSelectedListId, selectedList,
  audienceCount, canSend, sending,
  useSto, setUseSto, scheduleMode, setScheduleMode, scheduleLocal, setScheduleLocal,
  setShowPreview, setShowTestSend, setStudioMode,
  handleSaveDraft, handleSendClick, handleStepClick,
  toast, loadData,
}: FillSlotsViewProps) {
  const usedSlugs = getUsedSlugs(blocks)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <span>
          Template: <span className="font-medium text-[var(--text)]">{selectedTemplateName}</span>
        </span>
        <span className="tabular-nums text-[var(--text-muted)]">
          Schritt {stepIndex} von 3
        </span>
      </div>

      {composeStep === 'content' && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setStudioMode(true)}
            className="flex items-center gap-1.5 border border-[var(--border)] bg-[var(--background-card)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:border-primary-400 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:text-primary-400"
            title="Studio: vollflächiger Editor mit Live-Vorschau"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            Im Studio öffnen
          </button>
        </div>
      )}

      {composeStep === 'content' && (
        <div className="space-y-4">
          <div>
            <label className="mb-2 flex items-baseline justify-between text-sm font-medium text-[var(--text)]">
              <span>{abTestEnabled ? 'Betreffzeile · Variante A' : 'Betreffzeile'}</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Newsletter-Betreff…"
                className={inputCls + ' flex-1'}
              />
              <button
                onClick={() => generateSubject('a')}
                disabled={generatingSubject || blocks.length === 0}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
              >
                {generatingSubject ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <span>✨</span>
                )}
                {generatingSubject ? 'Generiere…' : 'Mit AI ausfüllen'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={abTestEnabled}
                onChange={(e) => setAbTestEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-[var(--text)]">A/B-Test (2 Varianten)</span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Empfänger werden gleichmässig auf zwei Betreffzeilen verteilt. Klickraten je Variante landen in der Historie. Nicht kombinierbar mit STO oder geplantem Versand.
                </span>
              </span>
            </label>
            {abTestEnabled && (
              <div className="mt-3">
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">Betreffzeile · Variante B</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={subjectVariantB}
                    onChange={(e) => setSubjectVariantB(e.target.value)}
                    placeholder="Alternativer Betreff für Variante B…"
                    className={inputCls + ' flex-1'}
                  />
                  <button
                    onClick={() => generateSubject('b')}
                    disabled={generatingSubject || blocks.length === 0}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                    title="Alternativen Betreff von der AI generieren lassen"
                  >
                    {generatingSubject ? (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <span>✨</span>
                    )}
                    {generatingSubject ? 'Generiere…' : 'Mit AI ausfüllen'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 flex items-baseline justify-between text-sm font-medium text-[var(--text)]">
              <span>Preheader <span className="text-xs font-normal text-[var(--text-muted)]">(optional)</span></span>
              <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{preheader.length}/{PREHEADER_MAX}</span>
            </label>
            <input
              type="text"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value.slice(0, PREHEADER_MAX))}
              maxLength={PREHEADER_MAX}
              placeholder="Vorschauzeile in der Inbox — die ersten ~110 Zeichen sind in Gmail/Apple Mail sichtbar."
              className={inputCls}
            />
          </div>
        </div>
      )}

      {composeStep === 'audience' && (
        <EngagementPanel
          slugs={[...usedSlugs]}
          audienceMode={audienceFilter?.mode ?? 'all'}
          onAudienceChange={setAudienceFilter}
        />
      )}

      {composeStep === 'audience' && availableLists.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text)]">Empfänger aus Liste</span>
            {selectedListId !== null && (
              <button
                onClick={() => setSelectedListId(null)}
                className="text-xs text-[var(--text-secondary)] underline hover:text-[var(--text)]"
              >
                Liste deaktivieren
              </button>
            )}
          </div>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Statt an alle Abonnenten geht der Newsletter nur an die Mitglieder dieser Liste. Praktisch für Tests.
          </p>
          <select
            value={selectedListId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setSelectedListId(v === '' ? null : parseInt(v, 10))
              if (v !== '') setAudienceFilter(null)
            }}
            className={inputCls + ' w-full'}
          >
            <option value="">— Alle Abonnenten / Segment —</option>
            {availableLists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.member_count})
              </option>
            ))}
          </select>
        </div>
      )}

      {composeStep === 'content' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
          {/* Left: Template slots */}
          <div className="space-y-1">
            <InsertToolbar onInsert={(type) => insertBlock(type, 0)} alwaysExpanded={blocks.length === 0} />
            {blocks.map((block, i) => (
              <React.Fragment key={block.id}>
                <SlotCard
                  block={block}
                  index={i}
                  posts={posts}
                  allBlocks={blocks}
                  onUpdate={(updated) => updateBlock(i, updated)}
                  onRemove={() => removeBlock(i)}
                  onMove={moveBlock}
                />
                <InsertToolbar onInsert={(type) => insertBlock(type, i + 1)} alwaysExpanded={i === blocks.length - 1} />
              </React.Fragment>
            ))}
          </div>

          {/* Right: Draggable article list */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-3">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)]">
                  Artikel (Drag &amp; Drop)
                </h4>
                <button
                  onClick={async () => {
                    toast.info('Artikel werden synchronisiert…')
                    try {
                      const res = await fetch('/api/admin/newsletter', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'sync-content' }),
                      })
                      const data = await res.json()
                      if (res.ok) {
                        toast.success(`${data.synced} Artikel synchronisiert.`)
                        loadData()
                      } else {
                        toast.error(data.error || 'Sync fehlgeschlagen.')
                      }
                    } catch {
                      toast.error('Sync fehlgeschlagen.')
                    }
                  }}
                  className="text-[10px] text-primary-600 hover:underline"
                  title="Artikel aus kokomo2026 synchronisieren"
                >
                  Aktualisieren
                </button>
              </div>
              <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {posts.slice(0, 20).map((post) => (
                  <DraggablePostItem
                    key={post.slug}
                    post={post}
                    isUsed={usedSlugs.has(post.slug)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {composeStep === 'review' && (
        <>
          <div className="border border-[var(--border)] bg-[var(--background-card)] p-4">
            <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Bereit zum Senden</h4>
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--text-secondary)]">Betreff</dt>
                <dd className="min-w-0 flex-1 truncate text-right text-[var(--text)]">
                  {subject || <span className="text-red-500">— fehlt —</span>}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--text-secondary)]">Blöcke</dt>
                <dd className="text-right tabular-nums text-[var(--text)]">{blocks.length}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--text-secondary)]">Empfänger</dt>
                <dd className="text-right tabular-nums text-[var(--text)]">
                  {audienceCount}
                  {selectedList ? <span className="text-[var(--text-muted)]"> · Liste «{selectedList.name}»</span>
                    : audienceFilter ? <span className="text-[var(--text-muted)]"> · Segment</span>
                    : <span className="text-[var(--text-muted)]"> · alle bestätigten Abos</span>}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <span className="mb-3 block text-sm font-medium text-[var(--text)]">Versand-Zeitpunkt</span>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="schedule-mode"
                  checked={scheduleMode === 'now'}
                  onChange={() => setScheduleMode('now')}
                  className="h-4 w-4 cursor-pointer"
                />
                <span className="text-sm text-[var(--text)]">Sofort senden</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="schedule-mode"
                  checked={scheduleMode === 'scheduled'}
                  onChange={() => {
                    setScheduleMode('scheduled')
                    if (!scheduleLocal) setScheduleLocal(defaultScheduleValue())
                  }}
                  className="h-4 w-4 cursor-pointer"
                />
                <span className="text-sm text-[var(--text)]">Geplant für…</span>
              </label>
              {scheduleMode === 'scheduled' && (
                <div className="ml-7 mt-2 space-y-1">
                  <input
                    type="datetime-local"
                    value={scheduleLocal}
                    onChange={(e) => setScheduleLocal(e.target.value)}
                    className={inputCls + ' w-full max-w-xs'}
                  />
                  <p className="text-xs text-[var(--text-muted)]">
                    Versand erfolgt zum gewählten Zeitpunkt (lokale Zeit). Resend übernimmt das Queueing.
                  </p>
                </div>
              )}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <input
              type="checkbox"
              checked={useSto}
              onChange={(e) => setUseSto(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer"
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-[var(--text)]">Send-Time Optimization</span>
              <span className="block text-xs text-[var(--text-muted)]">
                {scheduleMode === 'scheduled'
                  ? 'Ab dem geplanten Zeitpunkt: Empfänger mit Profil bekommen die Mail zu ihrer Lieblingszeit nach diesem Termin. Alle anderen erhalten sie genau zum geplanten Zeitpunkt.'
                  : 'Empfänger mit Profil bekommen die Mail zu ihrer persönlichen Lieblingszeit (gelernt aus bisherigen Öffnungen). Alle anderen erhalten sie sofort.'}
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={blocks.length === 0}
              className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            >
              Entwurf speichern
            </button>
            <button
              onClick={() => setShowPreview(true)}
              disabled={!blocksAreValid(blocks)}
              className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            >
              Vorschau
            </button>
            <button
              onClick={() => setShowTestSend(true)}
              disabled={sending || !subject.trim() || !blocksAreValid(blocks)}
              className="rounded-full border border-amber-400 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              Test senden
            </button>
            <button
              onClick={handleSendClick}
              disabled={sending || !canSend}
              className="flex-1 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md disabled:opacity-50"
            >
              {sending
                ? (scheduleMode === 'scheduled' ? 'Wird geplant…' : 'Wird versendet…')
                : `${scheduleMode === 'scheduled' ? 'Versand planen' : 'Senden'} • ${audienceCount} Abonnent${audienceCount !== 1 ? 'en' : ''}${audienceFilter ? ' (Segment)' : ''}`}
            </button>
          </div>
        </>
      )}

      {/* Wizard nav footer */}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={() => {
            if (composeStep === 'content') handleStepClick(0)
            else if (composeStep === 'audience') setComposeStep('content')
            else setComposeStep('audience')
          }}
          className="rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          ← {composeStep === 'content' ? 'Anderes Template' : 'Zurück'}
        </button>
        {composeStep !== 'review' && (
          <button
            type="button"
            onClick={() => {
              if (composeStep === 'content') {
                if (!contentReady) {
                  toast.error('Betreff und mindestens ein gültiger Block sind erforderlich.')
                  return
                }
                setComposeStep('audience')
              } else {
                setComposeStep('review')
              }
            }}
            className="rounded-full bg-primary-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700"
          >
            Weiter →
          </button>
        )}
      </div>
    </div>
  )
}
