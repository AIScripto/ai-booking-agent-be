import crypto from 'crypto';
import { config } from '../config';

/**
 * Signed, expiring, single-use OAuth `state` value.
 *
 * Format: <tenantId>.<expiresAtMs>.<nonce>.<signature>
 * The signature is an HMAC over the first three parts, so a caller cannot
 * change the tenant or reuse a state they did not get from us.
 * Used nonces are remembered in memory until they expire (single backend instance).
 */
const STATE_TTL_MS = 10 * 60 * 1000;

const usedNonces = new Map<string, number>();

function key(): Buffer {
  // Derived key: the Google client secret is never used directly as the HMAC key.
  return crypto.createHash('sha256').update(`oauth-state:${config.GOOGLE_CLIENT_SECRET}`).digest();
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', key()).update(payload).digest('hex');
}

function sweep(now: number): void {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) usedNonces.delete(nonce);
  }
}

export class OAuthStateService {
  public static create(tenantId: string, now: number = Date.now()): string {
    const payload = `${tenantId}.${now + STATE_TTL_MS}.${crypto.randomBytes(16).toString('hex')}`;
    return `${payload}.${sign(payload)}`;
  }

  /**
   * Returns the tenant id when the state is genuine, unexpired and not used before.
   * Returns null otherwise. A genuine state is consumed: a second call returns null.
   */
  public static consume(state: unknown, now: number = Date.now()): string | null {
    if (typeof state !== 'string') return null;
    const parts = state.split('.');
    if (parts.length !== 4) return null;
    const [tenantId, expiresAtRaw, nonce, signature] = parts;

    const expected = Buffer.from(sign(`${tenantId}.${expiresAtRaw}.${nonce}`), 'hex');
    const given = Buffer.from(signature, 'hex');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

    sweep(now);
    if (usedNonces.has(nonce)) return null;
    usedNonces.set(nonce, expiresAt);
    return tenantId;
  }
}
