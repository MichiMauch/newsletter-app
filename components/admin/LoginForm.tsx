'use client'

import { useState, type FormEvent } from 'react'

export default function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        onLogin()
      } else {
        const data = await res.json()
        setError(data.error || 'Login fehlgeschlagen.')
      }
    } catch {
      setError('Verbindung fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ width: 380 }}>
      <div style={{ borderBottom: '3px solid var(--color-primary)', marginBottom: 40, paddingBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
          Newsletter
        </div>
        <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1 }}>
          Admin
        </h2>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>E-Mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            style={{ width: '100%', padding: '12px 0', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', fontSize: 15, color: 'var(--text)', outline: 'none' }}
          />
        </div>
        <div style={{ marginBottom: 32 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Passwort</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            style={{ width: '100%', padding: '12px 0', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', fontSize: 15, color: 'var(--text)', outline: 'none' }}
          />
        </div>
        <button type="submit" disabled={loading} className="glow-button" style={{ width: '100%' }}>
          {loading ? 'Wird angemeldet…' : 'Anmelden →'}
        </button>
      </form>
      {error && (
        <div style={{ marginTop: 20, padding: '12px 16px', borderLeft: '3px solid #ef4444', background: 'var(--bg-secondary)', fontSize: 13, color: '#ef4444' }}>
          {error}
        </div>
      )}
    </div>
  )
}
