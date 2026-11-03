import { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000;

const tooMany = {
  status: 'error',
  message: 'Too many failed login attempts. Please wait a few minutes and try again.',
};

function emailOf(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Slows down password guessing. Only failed logins count (successes are skipped).
 * Two limits: one per address and email (so one person cannot lock out others behind the
 * same office address), and a wider one per address (so rotating emails does not help).
 */
export const loginLimitPerAccount = rateLimit({
  windowMs: WINDOW_MS,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${emailOf(req)}`,
  message: tooMany,
});

export const loginLimitPerAddress = rateLimit({
  windowMs: WINDOW_MS,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
  message: tooMany,
});
