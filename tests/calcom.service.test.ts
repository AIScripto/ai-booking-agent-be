import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import type { CalComService as CalComServiceType } from '../src/services/calcom.service';
const { CalComService } = require('../src/services/calcom.service');

describe('CalComService Unit Tests', () => {
  let calComService: CalComServiceType;
  const originalFetch = global.fetch;

  beforeEach(() => {
    calComService = new CalComService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('checkConnection', () => {
    it('should return true when API URL is configured', async () => {
      const isConnected = await calComService.checkConnection();
      expect(isConnected).toBe(true);
    });
  });

  describe('getAvailableSlots', () => {
    it('should query Cal.com availability slots endpoint with correct parameters', async () => {
      const mockSlotsResponse = {
        status: 'success',
        data: {
          slots: {
            '2026-08-11': [
              { time: '2026-08-11T09:00:00Z' },
              { time: '2026-08-11T10:00:00Z' },
            ],
          },
        },
      };

      const mockFetch = (jest.fn as any)().mockResolvedValue({
        ok: true,
        json: (jest.fn as any)().mockResolvedValue(mockSlotsResponse),
      });
      global.fetch = mockFetch;

      const query = {
        username: 'dr-smith',
        startTime: '2026-08-11T00:00:00Z',
        endTime: '2026-08-11T23:59:59Z',
        timeZone: 'America/New_York',
      };

      const result = await calComService.getAvailableSlots(query);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('/slots/available');
      expect(callUrl).toContain('username=dr-smith');
      expect(callUrl).toContain('timeZone=America%2FNew_York');
      expect(result).toEqual(mockSlotsResponse);
    });

    it('should throw an error if Cal.com API returns a non-OK status', async () => {
      const mockFetch = (jest.fn as any)().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });
      global.fetch = mockFetch;

      const query = {
        username: 'dr-smith',
        startTime: '2026-08-11T00:00:00Z',
        endTime: '2026-08-11T23:59:59Z',
      };

      await expect(calComService.getAvailableSlots(query)).rejects.toThrow(
        'Cal.com API error: 401 Unauthorized'
      );
    });
  });

  describe('createBooking', () => {
    it('should create a booking via Cal.com API POST endpoint', async () => {
      const mockBookingResponse = {
        status: 'success',
        data: {
          id: 12345,
          uid: 'booking-uid-999',
          title: '30 min consultation with Dr. Smith',
          start: '2026-08-11T09:00:00Z',
          end: '2026-08-11T09:30:00Z',
        },
      };

      const mockFetch = (jest.fn as any)().mockResolvedValue({
        ok: true,
        json: (jest.fn as any)().mockResolvedValue(mockBookingResponse),
      });
      global.fetch = mockFetch;

      const payload = {
        eventTypeId: 101,
        start: '2026-08-11T09:00:00Z',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+15550199',
        notes: 'Follow-up consultation',
      };

      const result = await calComService.createBooking(payload);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('/bookings');
      expect(result).toEqual(mockBookingResponse);
    });
  });
});
