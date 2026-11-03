import { prisma } from '../src/services/db.service';
import { AppointmentService } from '../src/services/appointment.service';
import { GoogleCalendarService } from '../src/services/google-calendar.service';
import { SmsService } from '../src/services/sms.service';
import { EmailService } from '../src/services/email.service';
import { config } from '../src/config';

jest.mock('../src/services/google-calendar.service');
jest.mock('../src/services/sms.service');
jest.mock('../src/services/email.service');

describe('Times shown to customers use the configured time zone (CDH-003)', () => {
  const tenantId = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f1201';
  const calendarId = 'time-zone-test-calendar';
  // 14:00 UTC in August is 10:00 AM in New York (EDT).
  const slot = new Date('2031-08-11T14:00:00.000Z');

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
      create: { id: tenantId, name: 'Time Zone Test', industry: 'HEALTHCARE' },
    });
    await prisma.appointment.deleteMany({ where: { tenantId, calendarId } });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { tenantId, calendarId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('the default time zone is New York unless the environment says otherwise', () => {
    expect(config.DEFAULT_TIME_ZONE).toBe('America/New_York');
  });

  it('the confirmation text carries the time in the configured zone, not UTC', async () => {
    await AppointmentService.createAppointment(tenantId, {
      calendarId,
      appointmentDateTime: slot,
      customerName: 'Zone Customer',
      customerPhone: '+10000000040',
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const timeText = (SmsService.formatConfirmationText as jest.Mock).mock.calls[0][2] as string;
    expect(timeText).toContain('10:00 AM');
    expect(timeText).toContain('EDT');
    expect(timeText).not.toContain('2:00 PM');
  });

  it('the "next available slot" message is also in the configured zone', async () => {
    // slot (14:00 UTC) is now taken, so asking for it as someone else offers 14:30 UTC = 10:30 AM EDT.
    await expect(
      AppointmentService.createAppointment(tenantId, {
        calendarId,
        appointmentDateTime: slot,
        customerName: 'Other Customer',
        customerPhone: '+10000000041',
      })
    ).rejects.toThrow(/10:30 AM EDT/);
  });
});
