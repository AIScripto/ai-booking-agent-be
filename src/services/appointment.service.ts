import { prisma } from './db.service';
import { GoogleCalendarService } from './google-calendar.service';

export class AppointmentService {
  /**
   * Checks availability of a slot across both the local database and the external Google Calendar.
   */
  public static async checkAvailability(
    tenantId: string,
    calendarId: string,
    dateTime: Date,
    durationMinutes: number = 30
  ): Promise<boolean> {
    // 1. Check local DB for active bookings (Rule of Least Privilege: explicit tenantId filter)
    const localConflict = await prisma.appointment.findFirst({
      where: {
        tenantId,
        calendarId,
        appointmentDateTime: dateTime,
        status: 'SCHEDULED',
      },
    });

    if (localConflict) {
      return false;
    }

    // 2. Check external Google Calendar
    const googleAvailable = await GoogleCalendarService.checkAvailability(
      tenantId,
      calendarId,
      dateTime,
      durationMinutes
    );

    return googleAvailable;
  }

  /**
   * Finds the next available slot starting from a reference date/time.
   * Scans forward in 30-minute increments.
   */
  public static async findNextAvailableSlot(
    tenantId: string,
    calendarId: string,
    startFrom: Date,
    durationMinutes: number = 30,
    maxSearchSteps: number = 8
  ): Promise<Date | null> {
    // Start searching from the next 30-minute interval
    let currentCheck = new Date(startFrom.getTime() + durationMinutes * 60000);

    for (let i = 0; i < maxSearchSteps; i++) {
      const isAvailable = await this.checkAvailability(
        tenantId,
        calendarId,
        currentCheck,
        durationMinutes
      );

      if (isAvailable) {
        return currentCheck;
      }

      currentCheck = new Date(currentCheck.getTime() + durationMinutes * 60000);
    }

    return null;
  }

  /**
   * Reserves an appointment. Uses database atomic constraints to prevent double booking.
   * If Google Calendar sync fails, rolls back the local insert.
   */
  public static async createAppointment(
    tenantId: string,
    data: {
      calendarId: string;
      appointmentDateTime: Date;
      customerName: string;
      customerPhone: string;
      customerEmail?: string | null;
      durationMinutes?: number;
    }
  ): Promise<any> {
    // Double-check availability first to avoid unnecessary failures
    const isAvailable = await this.checkAvailability(
      tenantId,
      data.calendarId,
      data.appointmentDateTime,
      data.durationMinutes
    );

    if (!isAvailable) {
      const nextSlot = await this.findNextAvailableSlot(
        tenantId,
        data.calendarId,
        data.appointmentDateTime,
        data.durationMinutes
      );

      if (nextSlot) {
        const formatter = new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        });
        const formattedTime = formatter.format(nextSlot);
        throw new Error(`The requested slot is already booked. The next available slot is on ${formattedTime}. Would you like to book that instead?`);
      }

      throw new Error('The requested slot is already booked.');
    }

    // Attempt atomic insertion into database.
    // If a concurrent process insert succeeded right before us, the db unique constraint will catch it.
    let appointment;
    try {
      appointment = await prisma.appointment.create({
        data: {
          tenantId,
          calendarId: data.calendarId,
          appointmentDateTime: data.appointmentDateTime,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail || null,
          status: 'SCHEDULED',
        },
      });
    } catch (dbError: any) {
      // Prisma code for unique constraint violation (P2002)
      if (dbError.code === 'P2002') {
        throw new Error('Concurrency conflict: The requested slot was booked by another caller.');
      }
      throw dbError;
    }

    // Trigger background asynchronous Google Calendar synchronization
    this.bgSyncGoogleCalendar(appointment.id, tenantId, data.calendarId, {
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      start: data.appointmentDateTime,
      durationMinutes: data.durationMinutes,
    }).catch((bgError) => {
      console.error(`[AppointmentService.createAppointment] Triggering background sync failed for appointment ${appointment.id}:`, bgError);
    });

    return appointment;
  }

  /**
   * Performs Google Calendar synchronization asynchronously in the background.
   */
  private static async bgSyncGoogleCalendar(
    appointmentId: string,
    tenantId: string,
    calendarId: string,
    details: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string | null;
      start: Date;
      durationMinutes?: number;
    }
  ): Promise<void> {
    try {
      const googleEventId = await GoogleCalendarService.createEvent(
        tenantId,
        calendarId,
        details
      );

      // Save googleEventId to the record (Rule of Least Privilege: filter by tenantId)
      await prisma.appointment.updateMany({
        where: {
          id: appointmentId,
          tenantId,
        },
        data: { googleEventId },
      });
      console.log(`[AppointmentService.bgSyncGoogleCalendar] Successfully synced appointment ${appointmentId} to Google Calendar.`);
    } catch (gcalError) {
      console.error(`[AppointmentService.bgSyncGoogleCalendar] Failed to sync appointment ${appointmentId} to Google Calendar:`, gcalError);
      // We do NOT roll back the database reservation. The booking remains in the local DB.
    }
  }

  /**
   * Cancels an appointment. Deletes Google Calendar event if synchronized.
   */
  public static async cancelAppointment(
    tenantId: string,
    appointmentId: string
  ): Promise<void> {
    // Verify ownership and fetch appointment (Rule of Least Privilege: filter by tenantId)
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
      },
    });

    if (!appointment) {
      throw new Error('Appointment not found or unauthorized.');
    }

    if (appointment.status === 'CANCELLED') {
      return;
    }

    // If synchronized with Google Calendar, cancel there
    if (appointment.googleEventId) {
      try {
        await GoogleCalendarService.deleteEvent(tenantId, appointment.calendarId, appointment.googleEventId);
      } catch (error) {
        console.warn(`[AppointmentService] Non-fatal error deleting calendar event on cancellation:`, error);
      }
    }

    // Update status in local DB (Rule of Least Privilege: filter by tenantId)
    await prisma.appointment.updateMany({
      where: {
        id: appointmentId,
        tenantId,
      },
      data: {
        status: 'CANCELLED',
      },
    });
  }
}
