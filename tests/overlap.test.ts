import { prisma } from '../src/services/db.service';
import { AppointmentService } from '../src/services/appointment.service';
import { GoogleCalendarService } from '../src/services/google-calendar.service';
import { SmsService } from '../src/services/sms.service';
import { EmailService } from '../src/services/email.service';

jest.mock('../src/services/google-calendar.service');
jest.mock('../src/services/sms.service');
jest.mock('../src/services/email.service');

describe('Overlapping and past appointments (DAT-002)', () => {
  const tenantId = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f1101';
  const calendarId = 'overlap-test-calendar';
  const at = (hhmm: string, day = '2031-07-07') => new Date(`${day}T${hhmm}:00.000Z`);
  let n = 0;
  const book = (when: Date) =>
    AppointmentService.createAppointment(tenantId, {
      calendarId,
      appointmentDateTime: when,
      customerName: `Customer ${++n}`,
      customerPhone: `+1000000${String(n).padStart(4, '0')}`,
    });

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
      create: { id: tenantId, name: 'Overlap Test', industry: 'HEALTHCARE' },
    });
  });

  beforeEach(async () => {
    await prisma.appointment.deleteMany({ where: { tenantId, calendarId } });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { tenantId, calendarId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('rejects a start 15 minutes after an existing 30 minute booking', async () => {
    await book(at('10:00'));
    await expect(book(at('10:15'))).rejects.toThrow(/already booked/);
  });

  it('rejects a start 15 minutes before an existing booking', async () => {
    await book(at('10:00'));
    await expect(book(at('09:45'))).rejects.toThrow(/already booked/);
  });

  it('accepts back-to-back bookings that only touch', async () => {
    await book(at('10:00'));
    await expect(book(at('10:30'))).resolves.toBeDefined();
    await expect(book(at('09:30'))).resolves.toBeDefined();
  });

  it('accepts an overlapping time when the earlier booking was cancelled', async () => {
    const first = await book(at('10:00'));
    await AppointmentService.cancelAppointment(tenantId, first.id);
    await expect(book(at('10:15'))).resolves.toBeDefined();
  });

  it('rejects a time well in the past, but allows right now (a few minutes of margin)', async () => {
    await expect(book(new Date(Date.now() - 60 * 60 * 1000))).rejects.toThrow(/in the future/);
    await expect(book(new Date(Date.now() - 10 * 60 * 1000))).rejects.toThrow(/in the future/);
    await expect(book(new Date(Date.now() - 60 * 1000))).resolves.toBeDefined();
  });

  it('lets only one of two overlapping requests win when they race', async () => {
    const results = await Promise.allSettled([book(at('11:00')), book(at('11:15'))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.appointment.count({ where: { tenantId, calendarId } })).toBe(1);
  });
});
