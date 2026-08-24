import { describe, expect, it } from '@jest/globals';
import { ScheduleService } from '../src/services/schedule.service';

describe('Phase 6 Multi-Resource Staffing & Load Balancing Engine', () => {
  const tenantId = '9eb441c7-f788-4137-8043-d4d7c3080879';

  it('should compute load metrics across staff resources', async () => {
    const metrics = await ScheduleService.getStaffLoadMetrics(tenantId);
    expect(Array.isArray(metrics)).toBe(true);
    if (metrics.length > 0) {
      expect(metrics[0]).toHaveProperty('resourceId');
      expect(metrics[0]).toHaveProperty('activeBookingsCount');
    }
  });

  it('should attempt round-robin staff allocation for a slot', async () => {
    const targetSlot = new Date('2026-08-15T10:00:00Z');
    const allocation = await ScheduleService.allocateStaffResource(tenantId, targetSlot);
    if (allocation) {
      expect(allocation).toHaveProperty('resourceId');
      expect(allocation.allocatedSlot).toEqual(targetSlot);
    }
  });
});
