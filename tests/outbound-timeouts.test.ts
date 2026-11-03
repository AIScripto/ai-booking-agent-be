import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import request from 'supertest';

jest.mock('../src/services/google-calendar.service');

// Short deadlines so the tests run in milliseconds.
jest.mock('../src/config/timeouts', () => ({
  TIMEOUTS: { VOICE_CALL_MS: 50, BACKGROUND_CALL_MS: 80, NEXT_SLOT_SEARCH_MS: 120 },
}));

import { calComService } from '../src/services/calcom.service';
import { slotCacheService } from '../src/services/slot-cache.service';
import { AppointmentService } from '../src/services/appointment.service';
import { GoogleCalendarService } from '../src/services/google-calendar.service';
const app = require('../src/app').default || require('../src/app');

/** A fetch that never answers; it only ends when the caller's AbortSignal fires. */
function stalledFetch(): jest.SpiedFunction<typeof fetch> {
  return jest.spyOn(global, 'fetch').mockImplementation(((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('aborted')));
    })) as typeof fetch);
}

describe('Outbound call deadlines (REL-001)', () => {
  beforeEach(() => {
    slotCacheService.invalidate();
  });

  it('Cal.com slot lookup gives up instead of waiting forever', async () => {
    const fetchSpy = stalledFetch();
    const started = Date.now();

    await expect(
      calComService.getAvailableSlots({ username: 'dr-x', startTime: 'a', endTime: 'b', timeZone: 'UTC' })
    ).rejects.toBeDefined();

    expect(Date.now() - started).toBeLessThan(1000);
    expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('the voice availability endpoint answers quickly with a spoken fallback when Google cannot be read', async () => {
    jest.mocked(GoogleCalendarService.getBusyIntervals).mockResolvedValue(null);
    const started = Date.now();

    const res = await request(app)
      .get('/api/v1/voice/check-availability')
      .query({ tenant_id: '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f0e01', date: '2031-08-12', timeZone: 'America/New_York' });

    expect(Date.now() - started).toBeLessThan(1000);
    expect(res.status).toBe(200);
    expect(res.body.data.availableSlots).toEqual([]);
    expect(res.body.data.responseText).toContain('unable to check the calendar');
  });

  it('the next-slot search stops when its total time is used up', async () => {
    const check = jest
      .spyOn(AppointmentService, 'checkAvailability')
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(false), 60)));

    const started = Date.now();
    const next = await AppointmentService.findNextAvailableSlot('t', 'c', new Date(), 30, 8);

    expect(next).toBeNull();
    expect(check.mock.calls.length).toBeLessThan(8);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
