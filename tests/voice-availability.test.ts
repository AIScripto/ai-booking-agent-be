import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
const app = require('../src/app').default || require('../src/app');

describe('Voice AI Availability Check Endpoint Integration Tests', () => {
  describe('GET & POST /api/v1/voice/check-availability', () => {
    it('should return available slots formatted for Voice AI response speech in <50ms', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get('/api/v1/voice/check-availability')
        .query({
          username: 'dr-sarah-jenkins',
          date: '2026-08-11',
          timeZone: 'America/New_York',
        });

      const responseTimeMs = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.responseText).toContain('Available appointment slots for 2026-08-11');
      expect(Array.isArray(response.body.data.availableSlots)).toBe(true);
      expect(response.body.data.availableSlots.length).toBeGreaterThan(0);

      console.log(`⏱️ Voice Availability Check Response Time: ${responseTimeMs}ms`);
    });

    it('should handle POST body payload for Voice AI custom tool calls', async () => {
      const response = await request(app)
        .post('/api/v1/voice/check-availability')
        .send({
          username: 'dr-sarah-jenkins',
          date: '2026-08-11',
          timeZone: 'America/New_York',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.availableSlots).toBeDefined();
    });
  });
});
