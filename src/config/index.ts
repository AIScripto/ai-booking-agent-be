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
  // How long an access token stays valid, for example 15m. Kept short: the refresh cookie renews it.
  JWT_EXPIRES_IN: z.string().default('15m'),
  // Database connection pool. When the database is far from the app, each round trip is slow and
  // opening a connection can take seconds, so allow a bigger pool and a longer wait. These apply
  // only if the DATABASE_URL does not already set connection_limit, pool_timeout or connect_timeout.
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  DB_POOL_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(120).default(30),
  DB_CONNECT_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(120).default(15),
  // Connections opened at start-up so the first users do not pay for opening them.
  DB_WARM_CONNECTIONS: z.coerce.number().int().min(0).max(50).default(5),
  // How many seconds the server remembers that a user is active (saves a database round trip per
  // request). A deactivated user keeps access for at most this long. 0 turns it off.
  AUTH_CACHE_SECONDS: z.coerce.number().int().min(0).max(60).default(10),
  // How many days a refresh cookie stays valid without being used (it is renewed on every use).
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(30).default(7),
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
