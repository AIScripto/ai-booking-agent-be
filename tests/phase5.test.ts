import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { SmsService } from '../src/services/sms.service';
import { EmailService } from '../src/services/email.service';
import { TelehealthService, TelehealthUnavailableError } from '../src/services/telehealth.service';
import { PaymentService, PaymentUnavailableError } from '../src/services/payment.service';

describe('Phase 5 Omnichannel Notifications, Telehealth & Payment Services', () => {
  describe('SmsService', () => {
    it('should format confirmation text correctly', () => {
      const text = SmsService.formatConfirmationText('Michael Scott', 'Consultation', '2026-08-12 at 10:30 AM');
      expect(text).toContain('Michael Scott');
      expect(text).toContain('Consultation');
      expect(text).toContain('2026-08-12 at 10:30 AM');
    });

    describe('sendConfirmation (SMS is not live)', () => {
      const saved = process.env.TWILIO_ACCOUNT_SID;
      afterEach(() => {
        if (saved === undefined) delete process.env.TWILIO_ACCOUNT_SID;
        else process.env.TWILIO_ACCOUNT_SID = saved;
      });

      it('reports disabled, not success, when Twilio is not configured', async () => {
        delete process.env.TWILIO_ACCOUNT_SID;
        const result = await SmsService.sendConfirmation({ to: '+15550199', body: 'Your appointment is confirmed.' });
        expect(result.success).toBe(false);
        expect(result.status).toBe('disabled');
        expect(result.sid).toBe('');
      });

      it('reports failed, not success, when settings exist but live sending is not built', async () => {
        process.env.TWILIO_ACCOUNT_SID = 'AC_test_value';
        const result = await SmsService.sendConfirmation({ to: '+15550199', body: 'Your appointment is confirmed.' });
        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
        expect(result.sid).toBe('');
      });
    });
  });

  describe('EmailService', () => {
    it('should generate valid RFC 5545 .ics iCalendar content', () => {
      const ics = EmailService.generateIcsContent({
        to: 'michael@example.com',
        subject: 'Confirmation',
        customerName: 'Michael Scott',
        serviceName: 'General Consultation',
        appointmentDateTime: new Date('2026-08-12T10:30:00Z'),
        providerName: 'Dr. Sarah Jenkins',
      });

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('END:VCALENDAR');
      expect(ics).toContain('SUMMARY:General Consultation with Dr. Sarah Jenkins');
    });

    describe('sendAppointmentConfirmation (email is not live)', () => {
      const saved = process.env.SENDGRID_API_KEY;
      const payload = {
        to: 'michael@example.com',
        subject: 'Confirmation',
        customerName: 'Michael Scott',
        serviceName: 'General Consultation',
        appointmentDateTime: new Date('2026-08-12T10:30:00Z'),
      };
      afterEach(() => {
        if (saved === undefined) delete process.env.SENDGRID_API_KEY;
        else process.env.SENDGRID_API_KEY = saved;
      });

      it('reports disabled, not success, when SendGrid is not configured', async () => {
        delete process.env.SENDGRID_API_KEY;
        const result = await EmailService.sendAppointmentConfirmation(payload);
        expect(result.success).toBe(false);
        expect(result.status).toBe('disabled');
        expect(result.messageId).toBe('');
      });

      it('reports failed, not success, when a key exists but live sending is not built', async () => {
        process.env.SENDGRID_API_KEY = 'SG.test_value';
        const result = await EmailService.sendAppointmentConfirmation(payload);
        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
      });
    });
  });

  describe('TelehealthService', () => {
    // Rooms are per appointment and there is no shared fallback room, so these
    // tests pin the failure paths as hard as the happy path. External HTTP is
    // mocked (AGENTS.md §10) — the suite must never create a real Daily.co room.
    const originalKey = process.env.DAILY_API_KEY;
    const originalFetch = global.fetch;

    beforeEach(() => {
      process.env.DAILY_API_KEY = 'test-daily-key';
    });

    afterEach(() => {
      if (originalKey === undefined) {
        delete process.env.DAILY_API_KEY;
      } else {
        process.env.DAILY_API_KEY = originalKey;
      }
      global.fetch = originalFetch;
    });

    /**
     * Installs a stub `fetch` returning one canned response, and hands back a
     * mutable call counter. Plain stub rather than `jest.fn()` so the response
     * shape stays typed without reaching for `any` (R2).
     */
    const mockFetchOnce = (status: number, body: unknown): { count: number } => {
      const calls = { count: 0 };
      global.fetch = ((): Promise<Response> => {
        calls.count += 1;
        return Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(body),
        } as unknown as Response);
      }) as unknown as typeof fetch;
      return calls;
    };

    it('creates a room dedicated to the appointment', async () => {
      const calls = mockFetchOnce(200, {
        name: 'room_appt-123_1',
        url: 'https://tenant.daily.co/room_appt-123_1',
      });

      const room = await TelehealthService.createVideoRoom('appt-1234', 'DAILY');

      expect(room.provider).toBe('DAILY');
      expect(room.roomUrl).toBe('https://tenant.daily.co/room_appt-123_1');
      expect(room.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(calls.count).toBe(1);
    });

    it('throws rather than returning a shared room when the provider declines', async () => {
      mockFetchOnce(401, { error: 'authentication-error' });

      await expect(TelehealthService.createVideoRoom('appt-1234', 'DAILY')).rejects.toBeInstanceOf(
        TelehealthUnavailableError
      );
    });

    it('throws rather than returning a shared room when the provider is unreachable', async () => {
      global.fetch = ((): Promise<Response> =>
        Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;

      await expect(TelehealthService.createVideoRoom('appt-1234', 'DAILY')).rejects.toBeInstanceOf(
        TelehealthUnavailableError
      );
    });

    it('throws when the API key is missing or a placeholder', async () => {
      const calls = mockFetchOnce(200, { url: 'https://tenant.daily.co/x' });

      delete process.env.DAILY_API_KEY;
      await expect(TelehealthService.createVideoRoom('a', 'DAILY')).rejects.toBeInstanceOf(
        TelehealthUnavailableError
      );

      process.env.DAILY_API_KEY = 'daily_api_key_placeholder';
      await expect(TelehealthService.createVideoRoom('a', 'DAILY')).rejects.toBeInstanceOf(
        TelehealthUnavailableError
      );

      // Never contacted the provider with an unusable key.
      expect(calls.count).toBe(0);
    });

    it.each(['ZOOM', 'GOOGLE_MEET'] as const)(
      'throws for %s instead of inventing an unreachable link',
      async (provider) => {
        await expect(TelehealthService.createVideoRoom('appt-1234', provider)).rejects.toBeInstanceOf(
          TelehealthUnavailableError
        );
      }
    );
  });

  describe('PaymentService', () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    afterEach(() => {
      if (saved === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = saved;
    });
    const request = { amountCents: 5000, currency: 'usd', customerEmail: 'michael@example.com' };

    it('never returns a made-up PaymentIntent when Stripe is not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      await expect(PaymentService.createPaymentIntent(request)).rejects.toBeInstanceOf(PaymentUnavailableError);
    });

    it('never returns a made-up PaymentIntent when a key exists but live Stripe is not built', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_value';
      await expect(PaymentService.createPaymentIntent(request)).rejects.toBeInstanceOf(PaymentUnavailableError);
    });
  });
});
