import { prisma } from '../src/services/db.service';
import { AppointmentService } from '../src/services/appointment.service';
import { GoogleCalendarService } from '../src/services/google-calendar.service';
import { SmsService } from '../src/services/sms.service';
import { EmailService } from '../src/services/email.service';
import { VoiceService } from '../src/services/voice.service';

jest.mock('../src/services/google-calendar.service');
jest.mock('../src/services/sms.service');
jest.mock('../src/services/email.service');

describe('Retries and parallel events are safe (DAT-003)', () => {
  const tenantId = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f1001';
  const calendarId = 'idempotency-test-calendar';
  const callSid = 'call-idempotency-test-1';
  const slot = new Date('2031-06-06T10:00:00.000Z');

  beforeEach(() => {
    (GoogleCalendarService.checkAvailability as jest.Mock).mockResolvedValue(true);
    (GoogleCalendarService.createEvent as jest.Mock).mockResolvedValue('evt');
    (SmsService.formatConfirmationText as jest.Mock).mockReturnValue('text');
    (SmsService.sendConfirmation as jest.Mock).mockResolvedValue({ success: false, sid: '', status: 'disabled' });
    (EmailService.sendAppointmentConfirmation as jest.Mock).mockResolvedValue({ success: false, messageId: '', status: 'disabled' });
  });

  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: 'Idempotency Test', industry: 'HEALTHCARE' },
    });
    await prisma.appointment.deleteMany({ where: { tenantId, calendarId } });
    await prisma.callLog.deleteMany({ where: { tenantId } });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { tenantId, calendarId } });
    await prisma.callLog.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('two parallel events for one call make exactly one CallLog', async () => {
    const log = (payload: object) => VoiceService['asyncLogCall'](tenantId, callSid, payload);
    await Promise.all([
      log({ message: { type: 'status-update', status: 'in-progress' } }),
      log({ message: { type: 'status-update', status: 'in-progress' } }),
      log({ message: { type: 'end-of-call-report', status: 'ended', transcript: 'hello' } }),
      log({ message: { type: 'speech-update' } }),
      log({ message: { type: 'status-update', status: 'in-progress' } }),
    ]);

    const rows = await prisma.callLog.findMany({ where: { tenantId, callSid } });
    expect(rows).toHaveLength(1);
  });

  it('the same booking delivered twice returns success twice with one row and one set of confirmations', async () => {
    const request = {
      calendarId,
      appointmentDateTime: slot,
      customerName: 'Retry Customer',
      customerPhone: '+10000000030',
      customerEmail: null,
    };

    const first = await AppointmentService.createAppointment(tenantId, request);
    const second = await AppointmentService.createAppointment(tenantId, request);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(second.id).toBe(first.id);
    expect(await prisma.appointment.count({ where: { tenantId, calendarId, appointmentDateTime: slot } })).toBe(1);
    expect(SmsService.sendConfirmation).toHaveBeenCalledTimes(1);
  });

  it('two identical bookings racing both succeed with one row', async () => {
    const raceSlot = new Date('2031-06-07T10:00:00.000Z');
    const request = {
      calendarId,
      appointmentDateTime: raceSlot,
      customerName: 'Race Customer',
      customerPhone: '+10000000031',
    };

    const results = await Promise.allSettled([
      AppointmentService.createAppointment(tenantId, request),
      AppointmentService.createAppointment(tenantId, request),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await prisma.appointment.count({ where: { tenantId, calendarId, appointmentDateTime: raceSlot } })).toBe(1);
  });

  it('a different customer asking for a taken slot is still rejected', async () => {
    await expect(
      AppointmentService.createAppointment(tenantId, {
        calendarId,
        appointmentDateTime: slot,
        customerName: 'Someone Else',
        customerPhone: '+10000000099',
      })
    ).rejects.toThrow(/already booked|booked by another caller/);
  });
});
