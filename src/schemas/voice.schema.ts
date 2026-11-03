import { z } from 'zod';
import { config } from '../config';

export const webhookQuerySchema = z.object({
  tenant_id: z.string().uuid({ message: 'tenant_id must be a valid UUID.' }),
  calendar_id: z.string().min(1, { message: 'calendar_id must not be empty.' }),
});

export const webhookPayloadSchema = z.object({
  type: z.string().optional(),
  message: z
    .object({
      type: z.string().optional(),
      call: z
        .object({
          id: z.string().optional(),
        })
        .optional(),
      toolCalls: z.array(z.any()).optional(),
      transcript: z.string().optional(),
    })
    .optional(),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
  arguments: z.any().optional(),
});

export const checkAvailabilitySchema = z.object({
  tenant_id: z.string().uuid({ message: 'tenant_id must be a valid UUID.' }).optional(),
  username: z.string().optional().default('dr-sarah-jenkins'),
  date: z.string().optional(),
  timeZone: z
    .string()
    .optional()
    .default(config.DEFAULT_TIME_ZONE)
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: 'timeZone must be a valid IANA time zone.' }
    ),
});

