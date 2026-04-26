'use client'

import { useCallback, useState } from 'react'
import type {
  NewsletterSend,
  OverallStatsData,
  Post,
  SendTrend,
  Subscriber,
  SubscriberGrowth,
} from '@/components/admin/types'

type Phase = 'checking' | 'login' | 'loaded'

export interface DataLoaderApi {
  phase: Phase
  setPhase: (p: Phase) => void
  subscribers: Subscriber[]
  sends: NewsletterSend[]
  posts: Post[]
  sendTrends: SendTrend[]
  subscriberGrowth: SubscriberGrowth[]
  overallStats: OverallStatsData | null
  loadData: () => Promise<void>
  loadTrends: () => Promise<void>
  streamingSend: (
    body: object,
    onProgress: (data: { sent: number; total: number; remaining: number }) => void,
  ) => Promise<{ sent: number; total: number }>
}

export function useDataLoader(): DataLoaderApi {
  const [phase, setPhase] = useState<Phase>('checking')
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [sends, setSends] = useState<NewsletterSend[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [sendTrends, setSendTrends] = useState<SendTrend[]>([])
  const [subscriberGrowth, setSubscriberGrowth] = useState<SubscriberGrowth[]>([])
  const [overallStats, setOverallStats] = useState<OverallStatsData | null>(null)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/newsletter?posts=1&stats=1')
      if (res.status === 401) {
        setPhase('login')
        return
      }
      const data = await res.json()
      setSubscribers(data.subscribers || [])
      setSends(data.sends || [])
      setPosts(data.posts || [])
      setOverallStats(data.overallStats || null)
      setPhase('loaded')
    } catch {
      setPhase('login')
    }
  }, [])

  const loadTrends = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/newsletter-trends')
      if (!res.ok) return
      const data = await res.json()
      setSendTrends(data.trends || [])
      setSubscriberGrowth(data.subscriberGrowth || [])
    } catch {
      // ignore
    }
  }, [])

  const streamingSend = useCallback(async (
    body: object,
    onProgress: (data: { sent: number; total: number; remaining: number }) => void,
  ): Promise<{ sent: number; total: number }> => {
    const res = await fetch('/api/admin/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Fehler beim Versenden.')
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastData = { sent: 0, total: 0 }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        const data = JSON.parse(line)
        lastData = data
        if (!data.done) onProgress(data)
      }
    }

    return lastData
  }, [])

  return {
    phase,
    setPhase,
    subscribers,
    sends,
    posts,
    sendTrends,
    subscriberGrowth,
    overallStats,
    loadData,
    loadTrends,
    streamingSend,
  }
}
