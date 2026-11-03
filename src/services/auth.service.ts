import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from './db.service';

export type StaffRole = 'ADMIN' | 'PROVIDER' | 'FRONT_DESK' | 'PATIENT';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: StaffRole;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: StaffRole;
  tenantId: string;
}

const ISSUER = 'booking-agent';
// 12 rounds in real use. Tests use the minimum so they stay fast on a busy machine.
const BCRYPT_ROUNDS = config.NODE_ENV === 'test' ? 4 : 12;

// Compared against when the email is unknown, so a wrong email and a wrong password take
// about the same time and cannot be told apart. Made once, on first use, not at import.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);
  return dummyHash;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class AuthService {
  public static hashPassword(password: string, rounds: number = BCRYPT_ROUNDS): Promise<string> {
    return bcrypt.hash(password, rounds);
  }

  /**
   * Checks an email and password. Returns the user and a signed token.
   * Throws AuthError with one fixed message for every failure.
   */
  public static async login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, isActive: true },
    });

    const matches = await bcrypt.compare(password, user ? user.passwordHash : await getDummyHash());
    if (!user || !matches) {
      throw new AuthError('Invalid email or password.');
    }

    return {
      token: AuthService.signToken({ userId: user.id, tenantId: user.tenantId, role: user.role }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  public static signToken(ctx: AuthContext): string {
    return jwt.sign({ tid: ctx.tenantId, role: ctx.role }, config.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: ISSUER,
      subject: ctx.userId,
      // jsonwebtoken types this as a template string; the value is validated by jsonwebtoken itself.
      expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  /**
   * Verifies the token and then re-reads the user, so a disabled user or a changed role takes
   * effect at once, not when the token expires. Returns null for anything that is not valid.
   */
  public static async authenticate(token: string): Promise<AuthContext | null> {
    let claims: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER });
      if (typeof decoded === 'string') return null;
      claims = decoded;
    } catch {
      return null;
    }

    if (typeof claims.sub !== 'string' || typeof claims.tid !== 'string') return null;

    const user = await prisma.user.findFirst({
      where: { id: claims.sub, tenantId: claims.tid, isActive: true },
      select: { id: true, tenantId: true, role: true },
    });
    if (!user) return null;

    return { userId: user.id, tenantId: user.tenantId, role: user.role };
  }

  /**
   * Creates a staff user, or resets the password of an existing user in the SAME tenant.
   * Used by the create-user script. Returns what happened.
   */
  public static async createUser(input: {
    tenantId: string;
    email: string;
    name?: string | null;
    role: StaffRole;
    password: string;
    resetIfExists?: boolean;
  }): Promise<{ action: 'created' | 'password-reset'; user: PublicUser }> {
    if (input.password.length < 12) {
      throw new AuthError('The password must be at least 12 characters.');
    }
    if (Buffer.byteLength(input.password, 'utf8') > 72) {
      throw new AuthError('The password must be at most 72 bytes.');
    }

    const email = input.email.trim().toLowerCase();
    const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
    if (!tenant) {
      throw new AuthError('Tenant not found.');
    }

    const passwordHash = await AuthService.hashPassword(input.password);
    const select = { id: true, email: true, name: true, role: true, tenantId: true } as const;

    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, tenantId: true },
    });

    if (existing) {
      if (existing.tenantId !== input.tenantId) {
        throw new AuthError('That email already belongs to a user in another tenant.');
      }
      if (!input.resetIfExists) {
        throw new AuthError('That email already exists. Use the reset option to change its password.');
      }
      const updated = await prisma.user.updateMany({
        where: { id: existing.id, tenantId: input.tenantId },
        data: { passwordHash, isActive: true },
      });
      if (updated.count !== 1) throw new AuthError('Could not update the user.');
      const user = await prisma.user.findFirst({ where: { id: existing.id, tenantId: input.tenantId }, select });
      if (!user) throw new AuthError('Could not read the user.');
      return { action: 'password-reset', user };
    }

    const user = await prisma.user.create({
      data: { tenantId: input.tenantId, email, name: input.name ?? null, role: input.role, passwordHash },
      select,
    });
    return { action: 'created', user };
  }

  public static async getPublicUser(ctx: AuthContext): Promise<PublicUser | null> {
    return prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId, isActive: true },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });
  }
}
