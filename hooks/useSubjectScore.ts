'use client'

import { useEffect, useRef, useState } from 'react'
import {
  scoreSubjectHeuristic,
  type SubjectScoreFactor,
} from '@/lib/subject-score'

export interface SubjectScoreState {
  /** 0-100. Heuristic-only while server fetch is in-flight, then full score. */
  score: number
  factors: SubjectScoreFactor[]
  similar: { subject: string; similarity: number; ctr: number; recipientCount: number }[]
  reasoning: string | null
  coldStart: boolean
  /** True while the server response is in-flight (heuristic still shown). */
  loading: boolean
}

/**
 * Live subject-score badge state. Heuristic runs synchronously on every
 * keystroke (no flicker, no spinner). The server endpoint adds historic
 * comparison + optional Claude reasoning, debounced 400ms so a typing user
 * doesn't fire a request per character.
 *
 * Pass `requestReasoning=true` to also fetch the LLM sentence in the next
 * round-trip — typically only set when the user explicitly opens the badge
 * popover, otherwise we'd burn Anthropic tokens on every keystroke.
 */
export function useSubjectScore(subject: string, requestReasoning = false): SubjectScoreState {
  const heuristic = scoreSubjectHeuristic(subject)
  const [state, setState] = useState<SubjectScoreState>(() => ({
    score: heuristic.score,
    factors: heuristic.factors,
    similar: [],
    reasoning: null,
    coldStart: false,
    loading: false,
  }))
  const reqIdRef = useRef(0)

  useEffect(() => {
    // Heuristic is cheap and synchronous — refresh it immediately so the
    // badge doesn't lag behind the input.
    const h = scoreSubjectHeuristic(subject)
    setState((prev) => ({
      ...prev,
      score: h.score,
      factors: h.factors,
      // Drop similars+reasoning if subject changed — the request below will
      // refresh them. Keeping stale ones would mislead.
      similar: [],
      reasoning: null,
      loading: subject.trim().length > 0,
    }))
    if (subject.trim().length === 0) {
      setState((prev) => ({ ...prev, loading: false, similar: [], reasoning: null }))
      return
    }

    const reqId = ++reqIdRef.current
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/subject-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, reasoning: requestReasoning }),
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as {
          score: number
          factors: SubjectScoreFactor[]
          similar: SubjectScoreState['similar']
          reasoning: string | null
          coldStart: boolean
        }
        // Stale-response guard — only the latest request wins.
        if (reqId !== reqIdRef.current) return
        setState({
          score: data.score,
          factors: data.factors,
          similar: data.similar ?? [],
          reasoning: data.reasoning,
          coldStart: data.coldStart,
          loading: false,
        })
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        // Keep heuristic-only state and stop spinner.
        if (reqId === reqIdRef.current) {
          setState((prev) => ({ ...prev, loading: false }))
        }
      }
    }, 400)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [subject, requestReasoning])

  return state
}
