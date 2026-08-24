import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/db.service';
import { AppointmentService } from '../services/appointment.service';
import { TelehealthService } from '../services/telehealth.service';
import { z } from 'zod';


export class AppointmentController {
  /**
   * Helper to extract and validate x-tenant-id header.
   */
  private static getTenantId(req: Request): string {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || req.query.tenantId;
    if (!tenantId || typeof tenantId !== 'string' || !z.string().uuid().safeParse(tenantId).success) {
      throw new Error('Unauthorized: Invalid or missing x-tenant-id header or tenant_id query parameter.');
    }
    return tenantId;
  }


  /**
   * GET /api/v1/appointments
   * Optional Query: date (YYYY-MM-DD)
   */
  public static async listAppointments(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tenantId = AppointmentController.getTenantId(req);
      const dateStr = req.query.date as string;

      let whereCondition: any = {
        tenantId,
        status: 'SCHEDULED', // Only list active scheduled appointments
      };

      if (dateStr && z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(dateStr).success) {
        const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
        const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
        whereCondition.appointmentDateTime = {
          gte: startOfDay,
          lte: endOfDay,
        };
      }

      const appointments = await prisma.appointment.findMany({
        where: whereCondition,
        orderBy: { appointmentDateTime: 'asc' },
      });

      res.status(200).json({
        status: 'success',
        data: appointments,
      });
    } catch (error: any) {
      res.status(400).json({
        status: 'error',
        message: error.message || 'Failed to list appointments.',
      });
    }
  }

  /**
   * POST /api/v1/appointments
   */
  public static async createAppointment(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tenantId = AppointmentController.getTenantId(req);
      const dateTimeRaw = req.body.dateTime || req.body.appointmentDateTime;
      const { customerName, customerPhone, customerEmail } = req.body;


      if (!dateTimeRaw || !customerName || !customerPhone) {
        res.status(400).json({
          status: 'error',
          message: 'dateTime (or appointmentDateTime), customerName, and customerPhone are required fields.',
        });
        return;
      }

      const parsedDate = new Date(dateTimeRaw);

      if (isNaN(parsedDate.getTime())) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid dateTime format.',
        });
        return;
      }

      const appointment = await AppointmentService.createAppointment(tenantId, {
        calendarId: 'primary', // Default main calendar for client bookings
        appointmentDateTime: parsedDate,
        customerName,
        customerPhone,
        customerEmail: customerEmail || null,
      });

      res.status(201).json({
        status: 'success',
        data: appointment,
      });
    } catch (error: any) {
      res.status(400).json({
        status: 'error',
        message: error.message || 'Failed to create appointment.',
      });
    }
  }

  /**
   * DELETE /api/v1/appointments/:id
   */
  public static async cancelAppointment(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tenantId = AppointmentController.getTenantId(req);
      const { id } = req.params;

      if (!id || !z.string().uuid().safeParse(id).success) {
        res.status(400).json({
          status: 'error',
          message: 'A valid appointment ID path parameter is required.',
        });
        return;
      }

      await AppointmentService.cancelAppointment(tenantId, id);

      res.status(200).json({
        status: 'success',
        message: 'Appointment successfully cancelled.',
      });
    } catch (error: any) {
      res.status(400).json({
        status: 'error',
        message: error.message || 'Failed to cancel appointment.',
      });
    }
  }

  /**
   * GET /api/v1/appointments/logs
   */
  public static async listCallLogs(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tenantId = AppointmentController.getTenantId(req);

      const logs = await prisma.callLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 30, // Limit to recent logs for dashboard view
      });

      res.status(200).json({
        status: 'success',
        data: logs,
      });
    } catch (error: any) {
      res.status(400).json({
        status: 'error',
        message: error.message || 'Failed to retrieve call logs.',
      });
    }
  }

  /**
   * POST /api/v1/appointments/:id/telehealth
   */
  public static async generateTelehealthLink(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tenantId = AppointmentController.getTenantId(req);
      const { id } = req.params;
      const provider = (req.body.provider as 'DAILY' | 'ZOOM' | 'GOOGLE_MEET') || 'DAILY';

      if (!id) {
        res.status(400).json({ status: 'error', message: 'Appointment ID parameter is required.' });
        return;
      }

      const room = await TelehealthService.createVideoRoom(id, provider);

      res.status(200).json({
        status: 'success',
        message: `${provider} video call link generated successfully.`,
        data: {
          appointmentId: id,
          provider: room.provider,
          roomUrl: room.roomUrl,
          expiresAt: room.expiresAt,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        status: 'error',
        message: error.message || 'Failed to generate telehealth link.',
      });
    }
  }
}

