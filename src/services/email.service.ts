import type { NotificationStatus } from './notification.types';

export interface EmailResult {
  success: boolean;
  messageId: string;
  status: NotificationStatus;
  reason?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  customerName: string;
  serviceName: string;
  appointmentDateTime: Date;
  providerName?: string;
  telehealthUrl?: string;
}

export class EmailService {
  // Read at call time (not import time) so a change of environment is honoured and tests are repeatable.
  private static get apiKey(): string | undefined {
    return process.env.SENDGRID_API_KEY;
  }

  /**
   * Generates standard RFC 5545 iCalendar (.ics) string for calendar import.
   */
  public static generateIcsContent(payload: EmailPayload): string {
    const startStr = payload.appointmentDateTime.toISOString().replace(/-|:|\.\d+/g, '');
    const endDate = new Date(payload.appointmentDateTime.getTime() + 30 * 60000);
    const endStr = endDate.toISOString().replace(/-|:|\.\d+/g, '');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Universal AI Booking Platform//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:booking-${Date.now()}@bookingplatform.com`,
      `DTSTAMP:${startStr}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${payload.serviceName} with ${payload.providerName || 'Doctor'}`,
      `DESCRIPTION:Appointment confirmed for ${payload.customerName}. ${payload.telehealthUrl ? `Join video: ${payload.telehealthUrl}` : ''}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  /**
   * Sends the appointment confirmation email.
   *
   * Email is not live yet. Without a SendGrid key this returns `disabled`, and
   * nothing is sent. With a key present, live sending is not built, so it
   * returns `failed` instead of pretending it worked.
   */
  public static async sendAppointmentConfirmation(_payload: EmailPayload): Promise<EmailResult> {
    if (!this.apiKey || this.apiKey.startsWith('SG.xxxx')) {
      console.log('[EmailService] Email not sent: SendGrid is not configured.');
      return { success: false, messageId: '', status: 'disabled', reason: 'SendGrid is not configured.' };
    }

    console.error('[EmailService] Email not sent: live SendGrid sending is not implemented.');
    return { success: false, messageId: '', status: 'failed', reason: 'Live SendGrid sending is not implemented.' };
  }
}
