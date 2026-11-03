import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { calComService } from '../src/services/calcom.service';
import { slotCacheService } from '../src/services/slot-cache.service';
const app = require('../src/app').default || require('../src/app');

const tenantA = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f0c01';
const tenantB = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f0c02';
const date = '2026-08-11';

describe('Voice AI Availability Check Endpoint Integration Tests', () => {
  let getSlots: jest.SpiedFunction<typeof calComService.getAvailableSlots>;

  beforeEach(() => {
    slotCacheService.invalidate();
    getSlots = jest.spyOn(calComService, 'getAvailableSlots');
  });

  it('returns real slots, spoken in the requested time zone', async () => {
    // 14:00 UTC is 10:00 AM in New York (EDT) in August.
    getSlots.mockResolvedValue({ data: { slots: { [date]: [{ time: `${date}T14:00:00Z` }] } } } as never);

    const res = await request(app)
      .get('/api/v1/voice/check-availability')
      .query({ tenant_id: tenantA, username: 'dr-x', date, timeZone: 'America/New_York' });

    expect(res.status).toBe(200);
    expect(res.body.data.availableSlots).toEqual(['10:00 AM']);
    expect(res.body.data.responseText).toContain('10:00 AM');
  });

  it('supports POST bodies for Voice AI custom tool calls', async () => {
    getSlots.mockResolvedValue({ data: { slots: { [date]: [{ time: `${date}T14:00:00Z` }] } } } as never);

    const res = await request(app)
      .post('/api/v1/voice/check-availability')
      .send({ tenant_id: tenantA, username: 'dr-x', date, timeZone: 'America/New_York' });

    expect(res.status).toBe(200);
    expect(res.body.data.availableSlots).toHaveLength(1);
  });

  it('says there are no slots instead of inventing them', async () => {
    getSlots.mockResolvedValue({ data: { slots: {} } } as never);

    const res = await request(app)
      .get('/api/v1/voice/check-availability')
      .query({ tenant_id: tenantA, username: 'dr-x', date });

    expect(res.status).toBe(200);
    expect(res.body.data.availableSlots).toEqual([]);
    expect(res.body.data.responseText).toContain('no available appointment slots');
  });

  it('does not offer made-up slots when Cal.com fails, and does not cache the failure', async () => {
    getSlots.mockRejectedValue(new Error('Cal.com down') as never);

    const res = await request(app)
      .get('/api/v1/voice/check-availability')
      .query({ tenant_id: tenantA, username: 'dr-x', date });

    expect(res.status).toBe(200);
    expect(res.body.data.availableSlots).toEqual([]);
    expect(res.body.data.responseText).toContain('unable to check the calendar');

    getSlots.mockResolvedValue({ data: { slots: { [date]: [{ time: `${date}T14:00:00Z` }] } } } as never);
    const retry = await request(app)
      .get('/api/v1/voice/check-availability')
      .query({ tenant_id: tenantA, username: 'dr-x', date });
    expect(retry.body.data.availableSlots).toHaveLength(1);
  });

  it('does not share cached slots between two tenants with the same username', async () => {
    getSlots.mockResolvedValue({ data: { slots: { [date]: [{ time: `${date}T14:00:00Z` }] } } } as never);
    await request(app).get('/api/v1/voice/check-availability').query({ tenant_id: tenantA, username: 'dr-x', date });

    getSlots.mockResolvedValue({ data: { slots: { [date]: [{ time: `${date}T15:00:00Z` }] } } } as never);
    const res = await request(app)
      .get('/api/v1/voice/check-availability')
      .query({ tenant_id: tenantB, username: 'dr-x', date, timeZone: 'America/New_York' });

    expect(res.body.data.cached).toBe(false);
    expect(res.body.data.availableSlots).toEqual(['11:00 AM']);
  });

  it('rejects an invalid time zone with 400', async () => {
    const res = await request(app)
      .get('/api/v1/voice/check-availability')
      .query({ tenant_id: tenantA, username: 'dr-x', date, timeZone: 'Mars/Olympus' });
    expect(res.status).toBe(400);
  });
});
