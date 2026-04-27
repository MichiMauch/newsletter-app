// Subject-line scoring.
//
// Layer 1 (heuristic, this file): a pure scoring function that runs in the
// browser on every keystroke. No IO, no async, no Anthropic — just rules-of-
// thumb based on observable subject-line shape (length, question, digits,
// personalisation, spam triggers, ALL-CAPS, excess punctuation, emoji).
//
// Layer 2 (server-side, lib/subject-score-server.ts) pulls in the historic
// click-rate of the most similar past subjects and combines its delta with
// the heuristic score. Layer 3 (optional, on-demand) asks Claude for a
// one-sentence reasoning. Both layers reuse the helpers exported here
// (tokenize, similarity).

export interface SubjectScoreFactor {
  /** Stable id, e.g. 'length', 'spam-free'. */
  id: string
  /** Localised label shown in the UI. */
  label: string
  /** Score delta in points, can be negative. */
  delta: number
}

export interface SubjectScoreResult {
  /** 0-100, clamped. Heuristic baseline of 50 plus all factor deltas. */
  score: number
  factors: SubjectScoreFactor[]
}

const GERMAN_STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einer',
  'und', 'oder', 'aber', 'doch', 'wenn', 'dann', 'weil', 'als', 'wie', 'so',
  'für', 'fuer', 'mit', 'von', 'vom', 'zum', 'zur', 'zu', 'im', 'in', 'an',
  'am', 'auf', 'aus', 'bei', 'um', 'über', 'ueber', 'unter', 'nach', 'vor',
  'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'kann', 'soll', 'will',
  'wir', 'ihr', 'sie', 'er', 'es', 'man', 'mich', 'dich', 'sich',
  'auch', 'noch', 'nur', 'schon', 'mehr', 'sehr', 'ganz', 'mal', 'doch',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you',
])

const SPAM_WORDS = [
  'gratis', 'umsonst', 'kostenlos', 'free', 'gewinnen', 'gewinnspiel',
  'winner', 'sale', 'rabatt', 'jetzt kaufen', 'click here', 'guarantee',
  'garantiert', 'exklusiv jetzt', 'limited offer', 'sofort',
]

/**
 * Splits the subject into normalised tokens for similarity comparison.
 * Lowercases, strips placeholder syntax + punctuation, drops short and
 * stopword tokens. Stable across both the browser heuristic and the server
 * layer so similarity calculations agree end-to-end.
 */
export function tokenizeSubject(subject: string): string[] {
  if (!subject) return []
  // Strip {{placeholder}} interpolations entirely — they don't contribute
  // to lexical similarity in a useful way.
  const stripped = subject.replace(/\{\{[^}]*\}\}/g, ' ')
  const cleaned = stripped
    .toLowerCase()
    // German chars stay intact; replace anything else non-letter/digit with space.
    .replace(/[^a-z0-9äöüß\s]/g, ' ')
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !GERMAN_STOPWORDS.has(t))
}

/**
 * Jaccard similarity of two token bags. Returns 0 when either side is empty
 * so the data layer can safely skip historic subjects with no useful tokens.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const t of setA) if (setB.has(t)) intersection += 1
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Computes the heuristic component of the subject score.
 *
 * The output is intentionally additive: each factor contributes a signed
 * delta. The UI lists every factor as a tooltip explanation, so deltas
 * should be human-meaningful (no opaque sums of micro-rules).
 */
export function scoreSubjectHeuristic(subject: string): SubjectScoreResult {
  const factors: SubjectScoreFactor[] = []
  const trimmed = subject.trim()

  if (trimmed.length === 0) {
    return { score: 0, factors: [{ id: 'empty', label: 'Leer', delta: 0 }] }
  }

  // ─── Length: sweet spot 30-60 chars
  const len = trimmed.length
  if (len >= 30 && len <= 60) {
    factors.push({ id: 'length-good', label: `Länge ideal (${len} Zeichen)`, delta: 10 })
  } else if (len < 20) {
    factors.push({ id: 'length-short', label: `Sehr kurz (${len} Zeichen)`, delta: -10 })
  } else if (len > 80) {
    factors.push({ id: 'length-long', label: `Sehr lang (${len} Zeichen, wird abgeschnitten)`, delta: -10 })
  } else {
    factors.push({ id: 'length-ok', label: `Länge okay (${len} Zeichen)`, delta: 0 })
  }

  // ─── Personalisation
  if (/\{\{[^}]+\}\}/.test(subject)) {
    factors.push({ id: 'personalization', label: 'Personalisierung ({{…}})', delta: 10 })
  }

  // ─── Question
  if (/\?/.test(trimmed)) {
    factors.push({ id: 'question', label: 'Frage erhöht Engagement', delta: 5 })
  }

  // ─── Number / digit
  if (/\d/.test(trimmed)) {
    factors.push({ id: 'number', label: 'Konkrete Zahl im Betreff', delta: 5 })
  }

  // ─── Emoji (rough check via surrogate / extended pictographic range)
  const hasEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(trimmed)
  if (hasEmoji) {
    factors.push({ id: 'emoji', label: 'Emoji vorhanden', delta: 3 })
  }

  // ─── Excessive punctuation
  if (/[!?]{2,}/.test(trimmed)) {
    factors.push({ id: 'multi-punct', label: 'Übermässige Satzzeichen (!! / ??)', delta: -8 })
  }

  // ─── ALL CAPS words (≥4 chars). Don't penalise short ones (e.g. "FAQ").
  const capsWords = trimmed.match(/\b[A-ZÄÖÜ]{4,}\b/g)
  if (capsWords && capsWords.length > 0) {
    factors.push({
      id: 'all-caps',
      label: `ALL-CAPS-Wörter wirken wie Spam (${capsWords.join(', ')})`,
      delta: -10,
    })
  }

  // ─── Spam trigger words
  const lower = trimmed.toLowerCase()
  const triggers = SPAM_WORDS.filter((w) => lower.includes(w))
  if (triggers.length > 0) {
    factors.push({
      id: 'spam-triggers',
      label: `Spam-Trigger: ${triggers.join(', ')}`,
      delta: -15,
    })
  }

  const baseline = 50
  const sum = factors.reduce((acc, f) => acc + f.delta, 0)
  const score = clamp(baseline + sum, 0, 100)
  return { score, factors }
}

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}
