import { describe, it, expect } from 'vitest'
import {
  jaccardSimilarity,
  scoreSubjectHeuristic,
  tokenizeSubject,
} from '@/lib/subject-score'

describe('tokenizeSubject', () => {
  it('lowercases, drops punctuation, drops stopwords, keeps umlauts', () => {
    expect(tokenizeSubject('Der grüne Newsletter — über die Stadt!')).toEqual([
      'grüne',
      'newsletter',
      'stadt',
    ])
  })

  it('strips placeholder syntax entirely', () => {
    // "{{firstName}}" disappears completely; "dein" is content-bearing in
    // a newsletter context so it stays. The point of the test is that the
    // tokenizer doesn't leak placeholder fragments like "firstname" into
    // the bag.
    const tokens = tokenizeSubject('Hallo {{firstName}}, dein Update zur Saison')
    expect(tokens).toContain('update')
    expect(tokens).toContain('saison')
    expect(tokens).not.toContain('firstname')
    expect(tokens).not.toContain('firstName')
  })

  it('returns empty array for empty / whitespace input', () => {
    expect(tokenizeSubject('')).toEqual([])
    expect(tokenizeSubject('   ')).toEqual([])
  })

  it('drops short tokens (<3 chars)', () => {
    expect(tokenizeSubject('A B XY foo')).toEqual(['foo'])
  })
})

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical token bags', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1)
  })

  it('returns 0.0 when either side is empty', () => {
    expect(jaccardSimilarity([], ['a'])).toBe(0)
    expect(jaccardSimilarity(['a'], [])).toBe(0)
  })

  it('computes intersection / union correctly', () => {
    // A = {a,b,c}, B = {b,c,d} → |∩|=2, |∪|=4 → 0.5
    expect(jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5)
  })

  it('treats duplicate tokens as a single set member', () => {
    expect(jaccardSimilarity(['a', 'a', 'b'], ['a', 'b'])).toBe(1)
  })
})

describe('scoreSubjectHeuristic', () => {
  it('returns 0 with an empty/leer factor for empty subject', () => {
    const r = scoreSubjectHeuristic('')
    expect(r.score).toBe(0)
    expect(r.factors).toEqual([{ id: 'empty', label: 'Leer', delta: 0 }])
  })

  it('rewards a 30-60 char subject with question + number', () => {
    const r = scoreSubjectHeuristic('5 Tipps für deinen besseren Newsletter heute?')
    // baseline 50 + length 10 + question 5 + number 5 = 70
    expect(r.score).toBe(70)
    expect(r.factors.map((f) => f.id)).toEqual(
      expect.arrayContaining(['length-good', 'question', 'number']),
    )
  })

  it('penalises ALL-CAPS words (≥4 chars) but ignores short caps like FAQ', () => {
    const all = scoreSubjectHeuristic('Lies das JETZT sofort sonst verpasst dus')
    expect(all.factors.find((f) => f.id === 'all-caps')).toBeTruthy()

    const faq = scoreSubjectHeuristic('Unsere FAQ zur neuen Saison')
    expect(faq.factors.find((f) => f.id === 'all-caps')).toBeFalsy()
  })

  it('penalises spam-trigger words', () => {
    const r = scoreSubjectHeuristic('Jetzt gratis und kostenlos anmelden')
    const spam = r.factors.find((f) => f.id === 'spam-triggers')
    expect(spam).toBeTruthy()
    expect(spam!.delta).toBe(-15)
  })

  it('penalises excessive punctuation (!! or ??)', () => {
    const r = scoreSubjectHeuristic('Wirklich wichtig!!')
    expect(r.factors.find((f) => f.id === 'multi-punct')).toBeTruthy()
  })

  it('rewards personalisation', () => {
    const r = scoreSubjectHeuristic('Hi {{firstName}}, dein Update')
    expect(r.factors.find((f) => f.id === 'personalization')).toBeTruthy()
  })

  it('penalises a very long subject (>80 chars)', () => {
    const r = scoreSubjectHeuristic(
      'Dies ist ein sehr langer Betreff der weit über 80 Zeichen geht und in der Inbox abgeschnitten wird.',
    )
    expect(r.factors.find((f) => f.id === 'length-long')).toBeTruthy()
    expect(r.score).toBeLessThan(50)
  })

  it('clamps score between 0 and 100', () => {
    const bad = scoreSubjectHeuristic('GRATIS!!! KOSTENLOS!!! GEWINNEN!!!')
    expect(bad.score).toBeGreaterThanOrEqual(0)
    expect(bad.score).toBeLessThanOrEqual(100)
  })
})
