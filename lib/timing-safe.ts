import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Constant-time string comparison via HMAC-SHA256.
 *
 * Both inputs are HMAC'd with the same per-process random key, then their
 * digests (always 32 bytes, regardless of input length) are compared with
 * `timingSafeEqual`. Properties:
 *
 * - No length leak: both digests are 32 bytes regardless of input length.
 * - No early-return on mismatch: HMAC is constant-time over its input.
 * - Attacker cannot precompute collisions: the HMAC key is per-process random.
 *
 * Use this for Bearer-token / shared-secret comparisons.
 */
const KEY = (() => {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Buffer.from(arr)
})()

export function safeEqualStrings(a: string, b: string): boolean {
  const aHash = createHmac('sha256', KEY).update(a).digest()
  const bHash = createHmac('sha256', KEY).update(b).digest()
  return timingSafeEqual(aHash, bHash)
}
