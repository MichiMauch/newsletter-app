// SQLite's `datetime('now')` returns UTC in 'YYYY-MM-DD HH:MM:SS' format —
// without the 'Z' suffix browsers parse it as *local* time, which silently
// shifts every displayed timestamp by the user's offset. Treat any missing
// suffix as UTC so the dates render correctly in CEST/CET.
export function parseDbDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN)
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(dateStr.trim())
  const iso = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T')
  return new Date(hasTz ? iso : `${iso}Z`)
}
