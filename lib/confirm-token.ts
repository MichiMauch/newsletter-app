/**
 * Stateless HMAC-SHA256 confirmation tokens.
 *
 * The token encodes (siteId, email, expiresAt) and a signature. No DB lookup
 * is needed to verify it, and an attacker cannot forge one without knowing
 * CONFIRM_TOKEN_SECRET. Tokens expire 24h after issue — older confirmation
 * mails are no longer accepted, which closes the "archived mail = silent
 * unsubscribe" hole that existed when confirm and unsubscribe used the same
 * stable UUID token.
 *
 * The unsubscribe token (UUID stored in newsletter_subscribers.token) remains
 * stable and unchanged — that one needs to live in every newsletter footer.
 */

import { createHmac, timingSafeEqual } from 'crypto'

const SECRET_ENV = 'CONFIRM_TOKEN_SECRET'
const TOKEN_TTL_HOURS = 24
const VERSION = 'v1'
const SIG_BYTES = 32 // SHA-256 digest length
const FIELD_SEP = '|'

function getSecret(): Buffer {
  const secret = process.env[SECRET_ENV]
  if (!secret || secret.length < 32) {
    throw new Error(`${SECRET_ENV} must be set and at least 32 characters long`)
  }
  return Buffer.from(secret, 'utf8')
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4)
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad), 'base64')
}

function hmac(payload: string): Buffer {
  return createHmac('sha256', getSecret()).update(payload).digest()
}

export function createConfirmToken(siteId: string, email: string): string {
  if (siteId.includes(FIELD_SEP) || email.includes(FIELD_SEP)) {
    throw new Error('siteId or email contains forbidden delimiter')
  }
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_HOURS * 3600
  const payload = `${VERSION}${FIELD_SEP}${siteId}${FIELD_SEP}${email.toLowerCase()}${FIELD_SEP}${expiresAt}`
  const sig = hmac(payload)
  return b64urlEncode(Buffer.concat([Buffer.from(payload, 'utf8'), sig]))
}

export type VerifyResult =
  | { ok: true; siteId: string; email: string }
  | { ok: false; reason: 'malformed' | 'invalid_version' | 'expired' | 'invalid_signature' }

export function verifyConfirmToken(token: string): VerifyResult {
  let raw: Buffer
  try {
    raw = b64urlDecode(token)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  // Smallest plausible payload: "v1|x|x@y.z|0" (~12 bytes) + 32 bytes sig.
  if (raw.length < SIG_BYTES + 8) {
    return { ok: false, reason: 'malformed' }
  }

  const sig = raw.subarray(raw.length - SIG_BYTES)
  const payloadStr = raw.subarray(0, raw.length - SIG_BYTES).toString('utf8')

  const parts = payloadStr.split(FIELD_SEP)
  if (parts.length !== 4) {
    return { ok: false, reason: 'malformed' }
  }
  const [version, siteId, email, expiresAtStr] = parts

  if (version !== VERSION) {
    return { ok: false, reason: 'invalid_version' }
  }

  const expectedSig = hmac(payloadStr)
  if (sig.length !== expectedSig.length || !timingSafeEqual(sig, expectedSig)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  const expiresAt = Number.parseInt(expiresAtStr, 10)
  if (!Number.isFinite(expiresAt)) {
    return { ok: false, reason: 'malformed' }
  }
  if (Math.floor(Date.now() / 1000) >= expiresAt) {
    return { ok: false, reason: 'expired' }
  }

  return { ok: true, siteId, email }
}
