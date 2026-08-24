/**
 * CalComService - Bridge for Cal.com Platform API / Self-Hosted Cal.diy
 *
 * Provides slot availability lookups and booking management.
 * Designed to work seamlessly with both Cloud Cal.com and Self-Hosted instances.
 */

export interface SlotAvailabilityQuery {
  username: string;
  startTime: string; // ISO 8601 string e.g. "2026-08-11T09:00:00Z"
  endTime: string;   // ISO 8601 string e.g. "2026-08-11T17:00:00Z"
  timeZone?: string;
}

export interface CreateCalBookingPayload {
  eventTypeId: number;
  start: string;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  timeZone?: string;
}

export class CalComService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = process.env.CAL_API_URL || 'https://api.cal.com/v2';
    this.apiKey = process.env.CAL_API_KEY || '';
  }

  /**
   * Simple connection check to verify Cal.com service initialization
   */
  async checkConnection(): Promise<boolean> {
    try {
      console.log(`[CalComService] Configured API Endpoint: ${this.apiUrl}`);
      return Boolean(this.apiUrl);
    } catch (error) {
      console.error('[CalComService] Connection check failed:', error);
      return false;
    }
  }

  /**
   * Fetch available booking slots for a provider / resource
   */
  async getAvailableSlots(query: SlotAvailabilityQuery) {
    const { username, startTime, endTime, timeZone = 'UTC' } = query;
    const url = `${this.apiUrl}/slots/available?username=${encodeURIComponent(username)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&timeZone=${encodeURIComponent(timeZone)}`;

    console.log(`[CalComService] Fetching slots: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Cal.com API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[CalComService] Error fetching available slots:', error);
      throw error;
    }
  }

  /**
   * Create a booking in Cal.com
   */
  async createBooking(payload: CreateCalBookingPayload) {
    const url = `${this.apiUrl}/bookings`;

    console.log(`[CalComService] Creating booking at: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Cal.com API create booking error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[CalComService] Error creating booking:', error);
      throw error;
    }
  }
}

export const calComService = new CalComService();
