import { Request, Response, NextFunction } from 'express';
import { webhookQuerySchema, checkAvailabilitySchema } from '../schemas/voice.schema';
import { VoiceService } from '../services/voice.service';
import { config } from '../config';

export class VoiceController {

  /**
   * HTTP Handler for incoming Voice Agent webhook tool-calling and notifications.
   */
  public static async handleWebhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log('📬 [Incoming Vapi Webhook Body]:', JSON.stringify(req.body, null, 2));
      
      // 1. Simple Security API Key Verification
      const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
      
      // Support bearer or simple string format
      const clientKey = typeof apiKey === 'string' && apiKey.startsWith('Bearer ') 
        ? apiKey.substring(7) 
        : apiKey;

      if (clientKey !== config.WEBHOOK_API_KEY) {
        res.status(401).json({
          status: 'error',
          message: 'Unauthorized: Invalid or missing API key.',
        });
        return;
      }

      // 2. Validate Query Parameters (tenant_id and calendar_id)
      const queryValidation = webhookQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed.',
          errors: queryValidation.error.format(),
        });
        return;
      }

      const { tenant_id: tenantId, calendar_id: calendarId } = queryValidation.data;

      // 3. Process the Webhook payload
      const result = await VoiceService.processWebhook(
        tenantId,
        calendarId,
        req.body
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Ultra-fast (<50ms target) HTTP endpoint for Voice AI slot availability checks.
   */
  public static async checkAvailability(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const payloadParams = Object.keys(req.query).length > 0 ? req.query : req.body;
      const validation = checkAvailabilitySchema.safeParse(payloadParams);
      
      if (!validation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed.',
          errors: validation.error.format(),
        });
        return;
      }

      const { tenant_id, username, date, timeZone } = validation.data;
      const result = await VoiceService.checkCalComAvailability(tenant_id, username, date, timeZone);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

