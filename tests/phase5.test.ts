import { describe, expect, it } from '@jest/globals';
import { SmsService } from '../src/services/sms.service';
import { EmailService } from '../src/services/email.service';
import { TelehealthService } from '../src/services/telehealth.service';
import { PaymentService } from '../src/services/payment.service';

describe('Phase 5 Omnichannel Notifications, Telehealth & Payment Services', () => {
  describe('SmsService', () => {
    it('should format confirmation text correctly', () => {
      const text = SmsService.formatConfirmationText('Michael Scott', 'Consultation', '2026-08-12 at 10:30 AM');
      expect(text).toContain('Michael Scott');
      expect(text).toContain('Consultation');
      expect(text).toContain('2026-08-12 at 10:30 AM');
    });

    it('should dispatch mock SMS confirmation cleanly', async () => {
      const result = await SmsService.sendConfirmation({
        to: '+15550199',
        body: 'Your appointment is confirmed.',
      });
      expect(result.success).toBe(true);
      expect(result.sid).toContain('SM_mock_');
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

    it('should dispatch mock email confirmation cleanly', async () => {
      const result = await EmailService.sendAppointmentConfirmation({
        to: 'michael@example.com',
        subject: 'Confirmation',
        customerName: 'Michael Scott',
        serviceName: 'General Consultation',
        appointmentDateTime: new Date('2026-08-12T10:30:00Z'),
      });
      expect(result.success).toBe(true);
      expect(result.messageId).toContain('msg_mock_');
    });
  });

  describe('TelehealthService', () => {
    it('should create virtual video room for Daily.co, Zoom, and Google Meet', async () => {
      const roomDaily = await TelehealthService.createVideoRoom('appt-1234', 'DAILY');
      expect(roomDaily.provider).toBe('DAILY');
      expect(roomDaily.roomUrl).toContain('daily.co');

      const roomZoom = await TelehealthService.createVideoRoom('appt-1234', 'ZOOM');
      expect(roomZoom.provider).toBe('ZOOM');
      expect(roomZoom.roomUrl).toContain('zoom.us');
    });
  });

  describe('PaymentService', () => {
    it('should generate Stripe PaymentIntent client secret', async () => {
      const payment = await PaymentService.createPaymentIntent({
        amountCents: 5000,
        currency: 'usd',
        customerEmail: 'michael@example.com',
      });
      expect(payment.clientSecret).toBeDefined();
      expect(payment.status).toBe('requires_payment_method');
    });
  });
});
