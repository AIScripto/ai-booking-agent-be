import { z } from 'zod';

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
