import request from 'supertest';
import { prisma } from '../src/services/db.service';
import { AppointmentService } from '../src/services/appointment.service';
import { AvailabilityService } from '../src/services/availability.service';
import { GoogleCalendarService } from '../src/services/google-calendar.service';
import { SmsService } from '../src/services/sms.service';
import { EmailService } from '../src/services/email.service';
import { slotCacheService } from '../src/services/slot-cache.service';
const app = require('../src/app').default || require('../src/app');

jest.mock('../src/services/google-calendar.service');
jest.mock('../src/services/sms.service');
jest.mock('../src/services/email.service');

const tenantA = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f1701';
const tenantB = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f1702';
const calendarId = 'availability-test-calendar';
const NY = 'America/New_York';

/** The first weekday (Mon-Fri) on or after a far-future day, so no slot is in the past. */
function aWeekday(from = '2031-08-11'): string {
  const d = new Date(`${from}T00:00:00Z`);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const weekday = aWeekday();
const saturday = (() => {
  const d = new Date(`${weekday}T00:00:00Z`);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
})();

const get = (query: Record<string, string>) => request(app).get('/api/v1/voice/check-availability').query(query);
const q = (extra: Record<string, string> = {}) => ({ tenant_id: tenantA, calendar_id: calendarId, date: weekday, timeZone: NY, ...extra });

describe('Voice availability: one source of truth (ARC-001, D3)', () => {
  beforeEach(() => {
    slotCacheService.invalidate();
    (GoogleCalendarService.getBusyIntervals as jest.Mock).mockResolvedValue([]);
    (GoogleCalendarService.checkAvailability as jest.Mock).mockResolvedValue(true);
    (GoogleCalendarService.createEvent as jest.Mock).mockResolvedValue('evt');
    (SmsService.formatConfirmationText as jest.Mock).mockReturnValue('text');
    (SmsService.sendConfirmation as jest.Mock).mockResolvedValue({ success: false, sid: '', status: 'disabled' });
    (EmailService.sendAppointmentConfirmation as jest.Mock).mockResolvedValue({ success: false, messageId: '', status: 'disabled' });
  });

  beforeAll(async () => {
    for (const id of [tenantA, tenantB]) {
      await prisma.tenant.upsert({ where: { id }, update: {}, create: { id, name: `Availability Test ${id.slice(-2)}`, industry: 'HEALTHCARE' } });
    }
    await prisma.appointment.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  });

  beforeEach(async () => {
    await prisma.appointment.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
  });

  it('lists the first free times in business hours, spoken in the requested zone, with matching UTC times', async () => {
    const res = await get(q());
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.availableSlots).toEqual(['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM']);
    expect(data.availableSlotsIso).toHaveLength(6);
    expect(data.totalFree).toBe(16);
    expect(data.responseText).toContain('10 more times');
    // August in New York is UTC-4, so 9:00 AM is 13:00 UTC.
    expect(data.availableSlotsIso[0]).toBe(`${weekday}T13:00:00.000Z`);
  });

  it('leaves out times taken by a local appointment and times blocked in Google Calendar', async () => {
    await prisma.appointment.create({
      data: { tenantId: tenantA, calendarId, appointmentDateTime: new Date(`${weekday}T14:00:00.000Z`), customerName: 'Held', customerPhone: '+10000000050', status: 'SCHEDULED' },
    });
    (GoogleCalendarService.getBusyIntervals as jest.Mock).mockResolvedValue([
      { start: new Date(`${weekday}T15:00:00.000Z`), end: new Date(`${weekday}T16:00:00.000Z`) }, // 11:00-12:00 New York
    ]);

    const res = await get(q());
    expect(res.body.data.availableSlots).toEqual(['9:00 AM', '9:30 AM', '10:30 AM', '12:00 PM', '12:30 PM', '1:00 PM']);
    expect(res.body.data.totalFree).toBe(16 - 1 - 2);
  });

  it('returns more times when a screen asks for them (limit), up to 50, and the answer says closed:false', async () => {
    const res = await get(q({ limit: '20' }));
    expect(res.body.data.availableSlots).toHaveLength(16);
    expect(res.body.data.availableSlotsIso).toHaveLength(16);
    expect(res.body.data.totalFree).toBe(16);
    expect(res.body.data.closed).toBe(false);
    expect(res.body.data.responseText).not.toContain('more times');

    const few = await get(q({ limit: '2' }));
    expect(few.body.data.availableSlots).toHaveLength(2);
    expect(few.body.data.cached).toBe(true); // same day, answered from the cache, cut to 2

    expect((await get(q({ limit: '51' }))).status).toBe(400);
    expect((await get(q({ limit: '0' }))).status).toBe(400);
  });

  it('says the business is closed on a weekend', async () => {
    const res = await get(q({ date: saturday }));
    expect(res.status).toBe(200);
    expect(res.body.data.availableSlots).toEqual([]);
    expect(res.body.data.closed).toBe(true);
    expect(res.body.data.responseText).toContain('closed');
  });

  it('when Google Calendar cannot be read, offers nothing and does not remember the failure', async () => {
    (GoogleCalendarService.getBusyIntervals as jest.Mock).mockResolvedValueOnce(null);
    const failed = await get(q());
    expect(failed.status).toBe(200);
    expect(failed.body.data.availableSlots).toEqual([]);
    expect(failed.body.data.responseText).toContain('unable to check the calendar');
    expect(failed.body.data.unavailable).toBe(true);
    expect(failed.body.data.closed).toBe(false);

    const retry = await get(q());
    expect(retry.body.data.availableSlots.length).toBeGreaterThan(0);
    expect(retry.body.data.unavailable).toBe(false);
  });

  it('never asks Cal.com', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await get(q());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('every time offered can really be booked, and a booked time stops being offered at once', async () => {
    const offered = (await get(q())).body.data.availableSlotsIso as string[];
    expect(offered.length).toBe(6);

    for (const iso of offered) {
      await expect(
        AppointmentService.createAppointment(tenantA, {
          calendarId,
          appointmentDateTime: new Date(iso),
          customerName: 'Booked',
          customerPhone: `+1000000${String(offered.indexOf(iso)).padStart(4, '0')}`,
        })
      ).resolves.toBeDefined();
    }

    // The slot cache was cleared by the bookings, so the next answer starts at 12:00 PM.
    const after = await get(q());
    expect(after.body.data.availableSlots[0]).toBe('12:00 PM');
    expect(after.body.data.cached).toBe(false);
  });

  it('a cancelled booking is offered again at once', async () => {
    const first = (await get(q())).body.data.availableSlotsIso[0] as string;
    const booked = await AppointmentService.createAppointment(tenantA, {
      calendarId, appointmentDateTime: new Date(first), customerName: 'Soon cancelled', customerPhone: '+10000000070',
    });
    expect((await get(q())).body.data.availableSlotsIso[0]).not.toBe(first);

    await AppointmentService.cancelAppointment(tenantA, booked.id);
    expect((await get(q())).body.data.availableSlotsIso[0]).toBe(first);
  });

  it('does not mix tenants: a time booked in one tenant is still free in another', async () => {
    const first = (await get(q())).body.data.availableSlotsIso[0] as string;
    await AppointmentService.createAppointment(tenantA, {
      calendarId, appointmentDateTime: new Date(first), customerName: 'A only', customerPhone: '+10000000071',
    });
    const b = await get(q({ tenant_id: tenantB }));
    expect(b.body.data.availableSlotsIso[0]).toBe(first);
  });

  it('leaves out times that have already passed', async () => {
    const now = new Date(`${weekday}T16:00:00.000Z`); // 12:00 PM in New York
    const { slots } = await AvailabilityService.getFreeSlots(tenantA, calendarId, weekday, NY, now);
    expect(slots[0].toISOString()).toBe(`${weekday}T16:00:00.000Z`);
    expect(slots).toHaveLength(10);
  });

  it('refuses a request without a tenant, with a bad date, or with a bad time zone (400)', async () => {
    const noTenant = { calendar_id: calendarId, date: weekday, timeZone: NY };
    expect((await get(noTenant)).status).toBe(400);
    expect((await get(q({ date: '2031-02-30' }))).status).toBe(400);
    expect((await get(q({ date: 'tomorrow' }))).status).toBe(400);
    expect((await get(q({ timeZone: 'Mars/Olympus' }))).status).toBe(400);
  });

  it('supports POST bodies for voice custom tool calls', async () => {
    const res = await request(app).post('/api/v1/voice/check-availability').send(q());
    expect(res.status).toBe(200);
    expect(res.body.data.availableSlots.length).toBeGreaterThan(0);
  });
});
