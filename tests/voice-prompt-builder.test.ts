import { describe, expect, it } from '@jest/globals';
import { VoicePromptBuilder } from '../src/services/voice-prompt.builder';

describe('VoicePromptBuilder Unit Tests', () => {
  describe('buildSystemPrompt', () => {
    it('should generate a healthcare-tailored system prompt', () => {
      const prompt = VoicePromptBuilder.buildSystemPrompt({
        tenantName: 'City Care Medical Center',
        industry: 'HEALTHCARE',
        resources: [{ name: 'Dr. Sarah Jenkins', title: 'Chief Cardiologist' }],
        serviceTypes: [{ name: 'General Consultation', durationMinutes: 30, price: 150 }],
        intakeFields: ['Symptoms', 'Insurance ID'],
      });

      expect(prompt).toContain('City Care Medical Center');
      expect(prompt).toContain('healthcare receptionist');
      expect(prompt).toContain('Dr. Sarah Jenkins (Chief Cardiologist)');
      expect(prompt).toContain('General Consultation (30 mins, $150)');
      expect(prompt).toContain('Symptoms');
      expect(prompt).toContain('checkAvailability');
      expect(prompt).toContain('bookAppointment');
    });

    it('should generate a salon-tailored system prompt', () => {
      const prompt = VoicePromptBuilder.buildSystemPrompt({
        tenantName: 'Velvet Hair Salon',
        industry: 'SALON_WELLNESS',
        resources: [{ name: 'Alex Rivera', title: 'Master Stylist' }],
        serviceTypes: [{ name: 'Haircut & Styling', durationMinutes: 45, price: 80 }],
        intakeFields: ['Hair Length', 'Allergies'],
      });

      expect(prompt).toContain('Velvet Hair Salon');
      expect(prompt).toContain('salon treatments');
      expect(prompt).toContain('Alex Rivera (Master Stylist)');
      expect(prompt).toContain('Haircut & Styling (45 mins, $80)');
    });
  });
});
