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
  // Signs login tokens. Use a long random value (at least 32 characters) and keep it secret.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters.'),
  // How long a login token stays valid, for example 8h or 30m.
  JWT_EXPIRES_IN: z.string().default('8h'),
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
