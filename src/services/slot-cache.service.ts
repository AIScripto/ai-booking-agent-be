/**
 * SlotCacheService - Ultra-Fast Availability Slot Caching Layer
 *
 * Designed to serve Voice AI slot availability queries in <5ms from cache,
 * eliminating network round-trip latencies during live phone calls.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class SlotCacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTtlMs: number;

  constructor(defaultTtlSeconds: number = 30) {
    this.defaultTtlMs = defaultTtlSeconds * 1000;
  }

  /**
   * Generate cache key for slot lookups
   */
  public static buildKey(username: string, date: string, timeZone: string): string {
    return `slots:${username}:${date}:${timeZone}`;
  }

  /**
   * Retrieve cached item if not expired
   */
  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached item with TTL
   */
  public set<T>(key: string, data: T, ttlSeconds?: number): void {
    const ttl = ttlSeconds ? ttlSeconds * 1000 : this.defaultTtlMs;
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { data, expiresAt });
  }

  /**
   * Invalidate specific key or clear all cache (e.g. on new booking creation)
   */
  public invalidate(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.cache.clear();
      console.log('[SlotCacheService] Cleared entire slot cache.');
      return;
    }

    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(`[SlotCacheService] Invalidated ${count} cache entries for prefix: ${keyPrefix}`);
  }

  /**
   * Get current cache size (useful for telemetry / monitoring)
   */
  public size(): number {
    return this.cache.size;
  }
}

export const slotCacheService = new SlotCacheService(30); // 30 second default TTL
