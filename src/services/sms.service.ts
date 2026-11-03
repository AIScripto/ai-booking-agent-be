import type { NotificationStatus } from './notification.types';

export interface SmsPayload {
  to: string;
  body: string;
  isWhatsApp?: boolean;
}

export interface SmsResult {
  success: boolean;
  sid: string;
  status: NotificationStatus;
  reason?: string;
}

export class SmsService {
  // Read at call time (not import time) so a change of environment is honoured and tests are repeatable.
  private static get accountSid(): string | undefined {
    return process.env.TWILIO_ACCOUNT_SID;
  }

  /**
   * Sends an SMS or WhatsApp confirmation to the customer.
   *
   * SMS is not live yet. Without Twilio settings this returns `disabled`, and
   * nothing is sent. With settings present, live sending is not built, so it
   * returns `failed` instead of pretending it worked.
   */
  public static async sendConfirmation(payload: SmsPayload): Promise<SmsResult> {
    const channel = payload.isWhatsApp ? 'WhatsApp' : 'SMS';

    if (!this.accountSid || this.accountSid.startsWith('ACxxxx')) {
      console.log(`[SmsService] ${channel} not sent: Twilio is not configured.`);
      return { success: false, sid: '', status: 'disabled', reason: 'Twilio is not configured.' };
    }

    console.error(`[SmsService] ${channel} not sent: live Twilio sending is not implemented.`);
    return { success: false, sid: '', status: 'failed', reason: 'Live Twilio sending is not implemented.' };
  }

  /**
   * Generates natural confirmation text formatted for industry vocabulary.
   */
  public static formatConfirmationText(customerName: string, serviceName: string, dateTimeStr: string): string {
    return `Hello ${customerName}, your appointment for ${serviceName} is confirmed for ${dateTimeStr}. Need to reschedule? Reply RESCHEDULE or call us anytime.`;
  }
}
