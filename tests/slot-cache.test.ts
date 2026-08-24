import { describe, expect, it, beforeEach } from '@jest/globals';
import { SlotCacheService, slotCacheService } from '../src/services/slot-cache.service';

describe('SlotCacheService Unit Tests', () => {
  let customCache: SlotCacheService;

  beforeEach(() => {
    customCache = new SlotCacheService(2); // 2 second TTL for test
  });

  describe('buildKey', () => {
    it('should generate consistent cache keys', () => {
      const key = SlotCacheService.buildKey('dr-smith', '2026-08-11', 'America/New_York');
      expect(key).toBe('slots:dr-smith:2026-08-11:America/New_York');
    });
  });

  describe('set and get', () => {
    it('should store and retrieve data within TTL', () => {
      const testData = { slots: ['09:00 AM', '10:30 AM'] };
      customCache.set('key1', testData);

      const cached = customCache.get<typeof testData>('key1');
      expect(cached).toEqual(testData);
    });

    it('should return null for expired entries', async () => {
      customCache.set('key-expire', { slots: [] }, 1); // 1 second TTL
      expect(customCache.get('key-expire')).not.toBeNull();

      // Wait 1.1s for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const cached = customCache.get('key-expire');
      expect(cached).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should invalidate specific prefix or clear all cache', () => {
      customCache.set('slots:dr-smith:2026-08-11', { data: 1 });
      customCache.set('slots:dr-smith:2026-08-12', { data: 2 });
      customCache.set('slots:dr-jones:2026-08-11', { data: 3 });

      expect(customCache.size()).toBe(3);

      customCache.invalidate('slots:dr-smith');
      expect(customCache.size()).toBe(1);
      expect(customCache.get('slots:dr-jones:2026-08-11')).toBeDefined();

      customCache.invalidate(); // clear all
      expect(customCache.size()).toBe(0);
    });
  });
});
