import { createSession } from '@/lib/admin-auth'

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  try {
    const { password } = await request.json()
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminPassword || password !== adminPassword) {
      return new Response(JSON.stringify({ error: 'Falsches Passwort.' }), { status: 401, headers })
    }

    const sessionToken = createSession()

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `admin_session=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${60 * 60 * 24 * 7}`,
      },
    })
  } catch (err) {
    console.error('[admin/login POST]', err)
    return new Response(JSON.stringify({ error: 'Login fehlgeschlagen.' }), { status: 500, headers })
  }
}
