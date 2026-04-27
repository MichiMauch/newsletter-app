import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '@/lib/sanitize'

describe('sanitizeHtml', () => {
  it('preserves allowed formatting tags', () => {
    const out = sanitizeHtml('<p><strong>Hi</strong> <em>there</em></p>')
    expect(out).toBe('<p><strong>Hi</strong> <em>there</em></p>')
  })

  it('strips <script> tags', () => {
    const out = sanitizeHtml('<p>safe</p><script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).toContain('safe')
  })

  it('strips inline event handlers', () => {
    const out = sanitizeHtml('<a href="https://x" onclick="evil()">link</a>')
    expect(out).not.toContain('onclick')
    expect(out).toContain('href="https://x"')
  })

  it('blocks javascript: URLs', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toContain('javascript:')
  })

  it('allows http/https/mailto schemes on links', () => {
    expect(sanitizeHtml('<a href="https://x.com">x</a>')).toContain('href="https://x.com"')
    expect(sanitizeHtml('<a href="mailto:a@b.c">x</a>')).toContain('href="mailto:a@b.c"')
  })

  it('strips iframe and object', () => {
    const out = sanitizeHtml('<iframe src="https://evil"></iframe><object data="bad"></object>')
    expect(out).not.toContain('iframe')
    expect(out).not.toContain('object')
  })

  it('leaves headings within whitelist alone', () => {
    expect(sanitizeHtml('<h2>title</h2>')).toBe('<h2>title</h2>')
  })

  it('strips disallowed tags but keeps inner text', () => {
    const out = sanitizeHtml('<div><span>kept</span></div>')
    expect(out).toContain('kept')
    expect(out).not.toContain('<div')
    expect(out).not.toContain('<span')
  })
})
