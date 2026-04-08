import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin')
  const pathname = request.nextUrl.pathname

  // ── Admin auth guard (fast reject if no session cookie) ──────────
  if (pathname.startsWith('/api/admin') && !pathname.startsWith('/api/admin/login')) {
    const cookie = request.cookies.get('admin_session')
    if (!cookie?.value) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Full session validation (DB check) happens in the route handler.
  }

  // ── CORS for public API routes ──────────────────────────────────
  if (pathname.startsWith('/api/v1/')) {
    if (request.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 })
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin)
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        response.headers.set('Access-Control-Max-Age', '86400')
      }
      return response
    }

    const response = NextResponse.next()
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
    }
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/admin/:path*', '/api/v1/:path*'],
}
