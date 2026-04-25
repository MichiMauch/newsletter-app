import { isAuthenticated } from '@/lib/admin-auth'
import { isTemplateKey, renderTemplateByKey } from '@/lib/email-template-registry'

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(request.url)
  const key = url.searchParams.get('template') ?? ''
  const format = url.searchParams.get('format') ?? 'html'

  if (!isTemplateKey(key)) {
    return new Response('Unknown template', { status: 404 })
  }

  if (format === 'text') {
    const text = await renderTemplateByKey(key, { plainText: true })
    return new Response(text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const html = await renderTemplateByKey(key)
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
