import { prisma } from '../src/services/db.service';
import { AppointmentService } from '../src/services/appointment.service';
import { GoogleCalendarService } from '../src/services/google-calendar.service';
import { SmsService } from '../src/services/sms.service';
import { EmailService } from '../src/services/email.service';

jest.mock('../src/services/google-calendar.service');
jest.mock('../src/services/sms.service');
jest.mock('../src/services/email.service');

describe('Confirmations after a booking (REL-002)', () => {
  const tenantId = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f0f01';
  const calendarId = 'confirmations-test-calendar';
  const slot = new Date('2031-05-05T10:00:00.000Z');

  const flush = () => new Promise((resolve) => setTimeout(resolve, 100));

  beforeEach(() => {
    (GoogleCalendarService.checkAvailability as jest.Mock).mockResolvedValue(true);
    (SmsService.formatConfirmationText as jest.Mock).mockReturnValue('text');
    (SmsService.sendConfirmation as jest.Mock).mockResolvedValue({ success: false, sid: '', status: 'disabled', reason: 'off' });
    (EmailService.sendAppointmentConfirmation as jest.Mock).mockResolvedValue({ success: false, messageId: '', status: 'disabled', reason: 'off' });
  });

  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: 'Confirmations Test', industry: 'HEALTHCARE' },
    });
    await prisma.appointment.deleteMany({ where: { tenantId, calendarId } });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { tenantId, calendarId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('still sends SMS and email when the calendar sync fails', async () => {
    (GoogleCalendarService.createEvent as jest.Mock).mockRejectedValue(new Error('Google down'));

    await AppointmentService.createAppointment(tenantId, {
      calendarId,
      appointmentDateTime: slot,
      customerName: 'A Customer',
      customerPhone: '+10000000020',
      customerEmail: 'a@example.com',
    });
    await flush();

    expect(SmsService.sendConfirmation).toHaveBeenCalledTimes(1);
    expect(EmailService.sendAppointmentConfirmation).toHaveBeenCalledTimes(1);
  });

  it('one channel failing does not stop the other, and nothing throws', async () => {
    const other = new Date('2031-05-06T10:00:00.000Z');
    (GoogleCalendarService.createEvent as jest.Mock).mockResolvedValue('evt');
    (SmsService.sendConfirmation as jest.Mock).mockRejectedValue(new Error('Twilio exploded'));

    await AppointmentService.createAppointment(tenantId, {
      calendarId,
      appointmentDateTime: other,
      customerName: 'B Customer',
      customerPhone: '+10000000021',
      customerEmail: 'b@example.com',
    });
    await flush();

    expect(EmailService.sendAppointmentConfirmation).toHaveBeenCalledTimes(1);
  });

  it('does not write the customer name, phone or email to the logs', async () => {
    const logs: string[] = [];
    const spies = (['log', 'error', 'warn'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      })
    );
    (GoogleCalendarService.createEvent as jest.Mock).mockResolvedValue('evt');

    await AppointmentService.createAppointment(tenantId, {
      calendarId,
      appointmentDateTime: new Date('2031-05-07T10:00:00.000Z'),
      customerName: 'Zebediah Quux',
      customerPhone: '+19998887777',
      customerEmail: 'zebediah@example.com',
    });
    await flush();
    spies.forEach((s) => s.mockRestore());

    const all = logs.join('\n');
    expect(all).not.toContain('Zebediah');
    expect(all).not.toContain('+19998887777');
    expect(all).not.toContain('zebediah@example.com');
  });
});
