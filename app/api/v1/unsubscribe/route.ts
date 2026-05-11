/**
 * One-Click Unsubscribe — RFC 8058 Endpoint.
 *
 * Wird als URL im List-Unsubscribe-Header eingetragen. Gmail/Yahoo POSTen
 * hierhin, sobald ein Empfänger die Unsubscribe-Pille im Mail-Client klickt.
 *
 * GET:  Browser-Fallback — leitet zur gestylten /unsubscribe Page weiter.
 * POST: One-Click — verarbeitet still und antwortet 200 ohne Body.
 *
 * Token-Reihenfolge: zuerst List-Member-Token (= nur aus EINER Liste raus,
 * Subscriber bleibt aktiv); fallback Subscriber-Token (= komplett abmelden,
 * Status 'blocked' + alle Mitgliedschaften geloescht).
 *
 * Per RFC 8058 muss diese Route ohne Login/Bestätigung funktionieren und
 * IMMER 2xx zurückgeben (auch bei unbekanntem Token), damit der Mail-Client
 * den Klick nicht als Fehlschlag wertet.
 */

import { getSubscriberByToken, blockSubscriberCompletely } from '@/lib/newsletter'
import { cancelEnrollments } from '@/lib/automation'
import { removeMemberByToken } from '@/lib/lists'

async function processUnsubscribe(token: string): Promise<void> {
  // 1) List-Member-Token: nur diese eine Liste abmelden, Subscriber bleibt aktiv.
  const listResult = await removeMemberByToken(token)
  if (listResult.removed) return

  // 2) Subscriber-Token: komplett abmelden — Status 'blocked' + alle Mitgliedschaften geloescht.
  const subscriber = await getSubscriberByToken(token)
  if (subscriber) {
    await cancelEnrollments(subscriber.email)
    await blockSubscriberCompletely(token)
  }
}

function tokenFromUrl(url: string): string | null {
  const token = new URL(url).searchParams.get('token')
  return token && token.length > 0 ? token : null
}

export async function POST(request: Request) {
  const token = tokenFromUrl(request.url)
  if (!token) {
    // 200 statt 400 — siehe Header-Kommentar oben
    return new Response(null, { status: 200 })
  }
  try {
    await processUnsubscribe(token)
  } catch (err) {
    console.error('[unsubscribe POST] failed for token:', err)
  }
  return new Response(null, { status: 200 })
}

export async function GET(request: Request) {
  const token = tokenFromUrl(request.url)
  // Immer auf die gestylte Seite weiterleiten — die übernimmt die Verarbeitung
  // und zeigt Bestätigung/Übersicht der verbleibenden Listen an.
  const target = token ? `/unsubscribe?token=${encodeURIComponent(token)}` : '/unsubscribe'
  return Response.redirect(new URL(target, request.url), 303)
}
