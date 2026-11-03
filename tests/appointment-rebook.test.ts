import { prisma } from '../src/services/db.service';
import { AppointmentService } from '../src/services/appointment.service';
import { GoogleCalendarService } from '../src/services/google-calendar.service';
import { SmsService } from '../src/services/sms.service';
import { EmailService } from '../src/services/email.service';

jest.mock('../src/services/google-calendar.service');
jest.mock('../src/services/sms.service');
jest.mock('../src/services/email.service');

describe('Cancel then rebook the same slot (DAT-001)', () => {
  const tenantId = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f0a01';
  const calendarId = 'rebook-test-calendar';
  const slot = new Date('2031-03-03T10:00:00.000Z');

  beforeEach(() => {
    (GoogleCalendarService.checkAvailability as jest.Mock).mockResolvedValue(true);
    (GoogleCalendarService.createEvent as jest.Mock).mockResolvedValue('evt-1');
    (GoogleCalendarService.deleteEvent as jest.Mock).mockResolvedValue(undefined);
    (SmsService.sendConfirmation as jest.Mock).mockResolvedValue({ success: true, sid: 'x' });
    (SmsService.formatConfirmationText as jest.Mock).mockReturnValue('text');
    (EmailService.sendAppointmentConfirmation as jest.Mock).mockResolvedValue({ success: true, messageId: 'x' });
  });

  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: 'Rebook Test Tenant', industry: 'HEALTHCARE' },
    });
    await prisma.appointment.deleteMany({ where: { tenantId, calendarId } });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { tenantId, calendarId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('lets a new customer book a slot that was cancelled', async () => {
    const first = await AppointmentService.createAppointment(tenantId, {
      calendarId, appointmentDateTime: slot, customerName: 'First', customerPhone: '+10000000001',
    });
    await AppointmentService.cancelAppointment(tenantId, first.id);

    const second = await AppointmentService.createAppointment(tenantId, {
      calendarId, appointmentDateTime: slot, customerName: 'Second', customerPhone: '+10000000002',
    });

    expect(second.status).toBe('SCHEDULED');
    expect(second.customerName).toBe('Second');
    expect(second.googleEventId).toBeNull();
    const rows = await prisma.appointment.findMany({ where: { tenantId, calendarId } });
    expect(rows).toHaveLength(1);
  });

  it('still rejects a slot that is currently booked', async () => {
    await expect(
      AppointmentService.createAppointment(tenantId, {
        calendarId, appointmentDateTime: slot, customerName: 'Third', customerPhone: '+10000000003',
      })
    ).rejects.toThrow(/already booked|booked by another caller/);
  });

  it('lets exactly one of two racing callers take a cancelled slot', async () => {
    const raceSlot = new Date('2031-03-04T10:00:00.000Z');
    const first = await AppointmentService.createAppointment(tenantId, {
      calendarId, appointmentDateTime: raceSlot, customerName: 'Owner', customerPhone: '+10000000010',
    });
    await AppointmentService.cancelAppointment(tenantId, first.id);

    const results = await Promise.allSettled([
      AppointmentService.createAppointment(tenantId, {
        calendarId, appointmentDateTime: raceSlot, customerName: 'Racer A', customerPhone: '+10000000011',
      }),
      AppointmentService.createAppointment(tenantId, {
        calendarId, appointmentDateTime: raceSlot, customerName: 'Racer B', customerPhone: '+10000000012',
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const rows = await prisma.appointment.findMany({
      where: { tenantId, calendarId, appointmentDateTime: raceSlot },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SCHEDULED');
  });
});
