import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin')
  const pathname = request.nextUrl.pathname

  // Only apply CORS to public API routes
  if (!pathname.startsWith('/api/v1/')) {
    return NextResponse.next()
  }

  // Handle preflight
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

export const config = {
  matcher: '/api/v1/:path*',
}
