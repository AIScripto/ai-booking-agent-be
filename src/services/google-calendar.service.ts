import { google } from 'googleapis';
import { config } from '../config';
import { prisma } from './db.service';

export class GoogleCalendarService {
  /**
   * Retrieves a Google Calendar client authenticated for the given tenant.
   * If the tenant does not have dynamic Google Credentials stored, falls back to the central .env configuration.
   */
  private static async getCalendarClient(tenantId: string) {
    const oauth2Client = new google.auth.OAuth2(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
      config.GOOGLE_REDIRECT_URI
    );

    // Look up tenant-specific credentials in Postgres
    const credentials = await prisma.googleCredential.findUnique({
      where: { tenantId },
    });

    if (credentials && credentials.refreshToken !== 'mock-refresh-token') {
      oauth2Client.setCredentials({
        access_token: credentials.accessToken,
        refresh_token: credentials.refreshToken,
        expiry_date: credentials.expiryDate.getTime(),
      });

      // Automatically listen for token refreshes and persist them to Postgres
      oauth2Client.on('tokens', async (newTokens) => {
        try {
          const expiryDate = newTokens.expiry_date
            ? new Date(newTokens.expiry_date)
            : new Date(Date.now() + 3600 * 1000);

          await prisma.googleCredential.update({
            where: { tenantId },
            data: {
              accessToken: newTokens.access_token!,
              ...(newTokens.refresh_token && { refreshToken: newTokens.refresh_token }),
              expiryDate,
            },
          });
          console.log(`[GoogleCalendarService] Refreshed and saved access token for tenant: ${tenantId}`);
        } catch (dbError) {
          console.error('[GoogleCalendarService] Failed to save auto-refreshed token to database:', dbError);
        }
      });
    } else {
      // Central Service Account / OAuth Fallback from environmental variables
      oauth2Client.setCredentials({
        refresh_token: config.GOOGLE_REFRESH_TOKEN,
      });
    }

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Checks if Google Calendar integration is in Mock Mode for a tenant.
   */
  private static async isMock(tenantId: string): Promise<boolean> {
    const credentials = await prisma.googleCredential.findUnique({
      where: { tenantId },
    });

    // If there are real credentials in the DB, it's not mock
    if (credentials && credentials.refreshToken !== 'mock-refresh-token') {
      return false;
    }

    // Check if the central fallback in .env is configured with real credentials
    const isCentralConfigured =
      config.GOOGLE_CLIENT_ID &&
      config.GOOGLE_CLIENT_ID !== 'your-google-client-id' &&
      !config.GOOGLE_CLIENT_ID.includes('mock') &&
      config.GOOGLE_CLIENT_SECRET &&
      config.GOOGLE_CLIENT_SECRET !== 'your-google-client-secret' &&
      !config.GOOGLE_CLIENT_SECRET.includes('mock') &&
      config.GOOGLE_REFRESH_TOKEN &&
      config.GOOGLE_REFRESH_TOKEN !== 'your-google-refresh-token' &&
      config.GOOGLE_REFRESH_TOKEN !== 'mock-refresh-token';

    return !isCentralConfigured;
  }

  /**
   * Checks if a calendar slot is available (no conflicting events).
   * @param tenantId The isolation boundary tenant ID
   * @param calendarId The calendar identifier (email or 'primary')
   * @param start ISO start date time
   * @param durationMinutes Duration of the appointment
   * @returns boolean true if slot is free, false otherwise
   */
  public static async checkAvailability(
    tenantId: string,
    calendarId: string,
    start: Date,
    durationMinutes: number = 30
  ): Promise<boolean> {
    try {
      if (await this.isMock(tenantId)) {
        console.log(`[GoogleCalendarService.checkAvailability] [Mock Mode] Slot is available.`);
        return true;
      }

      const calendar = await this.getCalendarClient(tenantId);
      const timeMin = start.toISOString();
      const timeMax = new Date(start.getTime() + durationMinutes * 60000).toISOString();

      const response = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      return events.length === 0;
    } catch (error) {
      console.error(`[GoogleCalendarService.checkAvailability] Error checking calendar ${calendarId} for tenant ${tenantId}:`, error);
      // Fallback: report slot is unavailable to prevent double bookings on API errors.
      return false;
    }
  }

  /**
   * Creates an event in Google Calendar.
   * @param tenantId The isolation boundary tenant ID
   * @param calendarId The target calendar
   * @param details Appointment particulars
   * @returns The generated googleEventId
   */
  public static async createEvent(
    tenantId: string,
    calendarId: string,
    details: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string | null;
      start: Date;
      durationMinutes?: number;
    }
  ): Promise<string> {
    try {
      if (await this.isMock(tenantId)) {
        const mockEventId = `mock-gcal-event-${Math.random().toString(36).substring(2, 11)}`;
        console.log(`[GoogleCalendarService.createEvent] [Mock Mode] Created mock event: ${mockEventId}`);
        return mockEventId;
      }

      const calendar = await this.getCalendarClient(tenantId);
      const duration = details.durationMinutes || 30;
      const end = new Date(details.start.getTime() + duration * 60000);

      const event = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: `Appointment: ${details.customerName}`,
          description: `Voice Agent Booking\nCustomer: ${details.customerName}\nPhone: ${details.customerPhone}\nEmail: ${details.customerEmail || 'N/A'}`,
          start: {
            dateTime: details.start.toISOString(),
          },
          end: {
            dateTime: end.toISOString(),
          },
          attendees: details.customerEmail ? [{ email: details.customerEmail }] : [],
        },
      });

      if (!event.data.id) {
        throw new Error('Google Calendar API response did not contain an event ID.');
      }

      return event.data.id;
    } catch (error) {
      console.error(`[GoogleCalendarService.createEvent] Error inserting event into calendar ${calendarId} for tenant ${tenantId}:`, error);
      throw new Error(`Failed to create Google Calendar event: ${(error as Error).message}`);
    }
  }

  /**
   * Deletes an event in Google Calendar.
   * @param tenantId The isolation boundary tenant ID
   * @param calendarId The target calendar
   * @param googleEventId The event ID to delete
   */
  public static async deleteEvent(
    tenantId: string,
    calendarId: string,
    googleEventId: string
  ): Promise<void> {
    try {
      if (await this.isMock(tenantId)) {
        console.log(`[GoogleCalendarService.deleteEvent] [Mock Mode] Deleted mock event: ${googleEventId}`);
        return;
      }

      const calendar = await this.getCalendarClient(tenantId);
      await calendar.events.delete({
        calendarId,
        eventId: googleEventId,
      });
    } catch (error) {
      console.error(`[GoogleCalendarService.deleteEvent] Error deleting event ${googleEventId} in ${calendarId} for tenant ${tenantId}:`, error);
      throw new Error(`Failed to delete Google Calendar event: ${(error as Error).message}`);
    }
  }
}
