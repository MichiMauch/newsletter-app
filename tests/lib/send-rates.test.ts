/**
 * Die Nenner der Versand-Kennzahlen.
 *
 * Sie sind bewusst nicht einheitlich, und genau darin lag ein Fehler, den diese
 * Tests festhalten: eine Klickrate gegen ALLE Empfänger gerechnet fällt, sobald
 * Mails bouncen — obwohl niemand klicken konnte, der nichts bekommen hat.
 */
import { describe, it, expect } from 'vitest'
import { computeSendRates } from '@/lib/newsletter-sends'

/** Der reale Versand vom 06.08. */
const SEND = {
  recipient_count: 64,
  delivered_count: 62,
  clicked_count: 11,
  bounced_count: 2,
  complained_count: 0,
  unsubscribed_count: 2,
}

describe('computeSendRates', () => {
  it('rechnet die Zustellrate gegen alle Empfänger', () => {
    expect(computeSendRates(SEND).delivery_rate).toBe(96.9)
  })

  it('rechnet die Klickrate gegen die Zugestellten', () => {
    // 11/62, nicht 11/64 — wer nichts bekommen hat, kann nicht klicken.
    expect(computeSendRates(SEND).click_rate).toBe(17.7)
  })

  it('rechnet die Bounce-Rate gegen alle Empfänger', () => {
    // 2/64: Bounces sind ja gerade die NICHT zugestellten, sie gehören
    // zwingend in einen Nenner, der sie enthält.
    expect(computeSendRates(SEND).bounce_rate).toBe(3.1)
  })

  it('rechnet die Abmelderate gegen die Zugestellten', () => {
    expect(computeSendRates(SEND).unsubscribe_rate).toBe(3.2)
  })

  it('liefert 0 statt NaN, wenn nichts zugestellt wurde', () => {
    // Abgebrochener Versand: eine Division durch null darf keine kaputte
    // Prozentzahl ins UI schreiben.
    const rates = computeSendRates({
      recipient_count: 64, delivered_count: 0, clicked_count: 0,
      bounced_count: 0, complained_count: 0, unsubscribed_count: 0,
    })
    expect(rates.click_rate).toBe(0)
    expect(rates.unsubscribe_rate).toBe(0)
    expect(rates.delivery_rate).toBe(0)
  })

  it('kommt ohne Abmeldezahl klar', () => {
    const { unsubscribed_count, ...withoutUnsubs } = SEND
    void unsubscribed_count
    expect(computeSendRates(withoutUnsubs).unsubscribe_rate).toBe(0)
  })

  it('rundet auf eine Nachkommastelle', () => {
    const rates = computeSendRates({
      recipient_count: 3, delivered_count: 3, clicked_count: 1,
      bounced_count: 0, complained_count: 0, unsubscribed_count: 0,
    })
    expect(rates.click_rate).toBe(33.3)
  })
})
