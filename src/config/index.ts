import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REFRESH_TOKEN: z.string(),
  GOOGLE_CALLBACK_URL: z.string().url(),
  GOOGLE_DEFAULT_CALENDAR_ID: z.string().default('primary'),
  WEBHOOK_API_KEY: z.string(),
  // Time zone used when speaking or messaging a time to a customer. Times are stored in UTC.
  // Per-tenant time zones need a schema change; until then this one applies to everyone.
  DEFAULT_TIME_ZONE: z
    .string()
    .default('America/New_York')
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: 'DEFAULT_TIME_ZONE must be a valid IANA time zone.' }
    ),
});

// Run validation
const parseConfig = () => {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment configuration:', result.error.format());
    process.exit(1);
  }

  return result.data;
};

export const config = parseConfig();
