import type { AuthContext } from './auth.service';

/**
 * A very short in-memory memory of "this user is active, with this role".
 *
 * Why: the database can be far from the app, and checking the user on every request costs a whole
 * round trip. Only successful checks are kept, for a few seconds. The trade-off, on purpose:
 * a user who is deactivated or whose role changes keeps the old access for at most the cache time
 * (AUTH_CACHE_SECONDS, default 10) on the server that cached it. Signing out clears the entry at once.
 * Refresh tokens are not affected: they always check the database.
 */
export class AuthCache {
  private entries = new Map<string, { ctx: AuthContext; expiresAt: number }>();
  private ttlMs: number;

  constructor(ttlSeconds: number, private now: () => number = Date.now) {
    this.ttlMs = ttlSeconds * 1000;
  }

  /** Change the time (used by tests). 0 turns the cache off. */
  public setTtlSeconds(ttlSeconds: number): void {
    this.ttlMs = ttlSeconds * 1000;
    this.entries.clear();
  }

  private key(userId: string, tenantId: string): string {
    return `${userId}|${tenantId}`;
  }

  public get(userId: string, tenantId: string): AuthContext | null {
    if (this.ttlMs <= 0) return null;
    const entry = this.entries.get(this.key(userId, tenantId));
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(this.key(userId, tenantId));
      return null;
    }
    return entry.ctx;
  }

  public set(ctx: AuthContext): void {
    if (this.ttlMs <= 0) return;
    // Keep the map small: drop expired entries when it grows.
    if (this.entries.size >= 1000) {
      const now = this.now();
      for (const [k, v] of this.entries) if (v.expiresAt <= now) this.entries.delete(k);
    }
    this.entries.set(this.key(ctx.userId, ctx.tenantId), { ctx, expiresAt: this.now() + this.ttlMs });
  }

  /** Forget everything cached for one user (all tenants). */
  public invalidateUser(userId: string): void {
    for (const k of this.entries.keys()) {
      if (k.startsWith(`${userId}|`)) this.entries.delete(k);
    }
  }

  public clear(): void {
    this.entries.clear();
  }
}
