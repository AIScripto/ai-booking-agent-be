import crypto from 'crypto';
import { prisma } from '../../src/services/db.service';
import { AuthService, StaffRole } from '../../src/services/auth.service';

export const TEST_PASSWORD = 'correct horse battery staple';

export interface TestStaff {
  id: string;
  email: string;
  password: string;
  token: string;
}

/** Creates a real staff user in the tenant (cheap bcrypt cost, tests only) and a valid token. */
export async function createStaff(tenantId: string, role: StaffRole = 'ADMIN'): Promise<TestStaff> {
  const email = `test-${crypto.randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await AuthService.hashPassword(TEST_PASSWORD, 4),
      role,
      name: 'Test Staff',
    },
  });
  const token = AuthService.signToken({ userId: user.id, tenantId, role });
  return { id: user.id, email, password: TEST_PASSWORD, token };
}

export async function removeStaff(...staff: Array<TestStaff | undefined>): Promise<void> {
  const ids = staff.filter((s): s is TestStaff => Boolean(s)).map((s) => s.id);
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

export const bearer = (staff: TestStaff) => ({ Authorization: `Bearer ${staff.token}` });
