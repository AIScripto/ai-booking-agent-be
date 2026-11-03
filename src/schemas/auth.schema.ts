import { z } from 'zod';

// bcrypt only uses the first 72 bytes of a password, so longer input is refused instead of
// being silently cut.
export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z
    .string()
    .min(1)
    .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, { message: 'Password is too long.' }),
});

export type LoginInput = z.infer<typeof loginSchema>;
