/**
 * Per-recipient placeholder substitution for newsletter content.
 *
 * Supported tokens:
 *   {{firstName}}                 → Sibylle  (or empty when not set)
 *   {{firstName|du}}              → Sibylle  (or "du" fallback)
 *   {{firstName|liebe Leserin}}   → Sibylle  (or "liebe Leserin" fallback)
 *
 * Whitespace inside the fallback is preserved. The pipe character cannot
 * appear inside the fallback — that is fine for greeting use-cases.
 *
 * Substitution runs after rendering, on the final HTML, plain-text, subject,
 * and preheader. That way it works equally well in user-authored Tiptap text
 * blocks, in admin-edited subject lines, and in static template chrome.
 */

export interface PersonalizationVars {
  firstName: string | null
}

const FIRST_NAME_RE = /\{\{firstName(?:\|([^}|]*))?\}\}/g

export function substitutePersonalization(input: string, vars: PersonalizationVars): string {
  if (!input) return input
  return input.replace(FIRST_NAME_RE, (_, fallback: string | undefined) => {
    if (vars.firstName && vars.firstName.length > 0) return vars.firstName
    return fallback ?? ''
  })
}
