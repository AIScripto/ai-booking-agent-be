import crypto from 'crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { config } from '../src/config';
import { prisma } from '../src/services/db.service';
import { createStaff, removeStaff, TestStaff } from './helpers/auth';

describe('Refresh tokens (SEC-012)', () => {
  const tenantId = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f1501';
  const refreshKey = crypto.createHash('sha256').update(`refresh-token:${config.JWT_SECRET}`).digest();
  const csrf = { 'X-Requested-With': 'fetch' };
  let n = 0;
  const freshIp = () => `10.8.${Math.floor(++n / 250)}.${n % 250}`;
  const created: TestStaff[] = [];

  const newStaff = async () => {
    const s = await createStaff(tenantId, 'ADMIN');
    created.push(s);
    return s;
  };

  /** Signs in and returns the access token plus the raw refresh cookie header value. */
  const signIn = async (staff: TestStaff, extra: Record<string, string> = {}) => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', freshIp())
      .set(extra)
      .send({ email: staff.email, password: staff.password });
    expect(res.status).toBe(200);
    const setCookie = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const raw = setCookie.find((c) => c.startsWith('refresh_token='));
    return { res, raw, cookie: raw ? raw.split(';')[0] : '', access: res.body.data.token as string };
  };

  const refreshWith = (cookie: string, headers: Record<string, string> = csrf) =>
    request(app).post('/api/v1/auth/refresh').set('X-Forwarded-For', freshIp()).set(headers).set('Cookie', cookie);

  const refreshTokenFor = (
    userId: string,
    uv: number,
    ss: number,
    options: jwt.SignOptions = {}
  ) =>
    jwt.sign({ tid: tenantId, uv, ss }, refreshKey, {
      algorithm: 'HS256',
      issuer: 'booking-agent',
      audience: 'refresh',
      subject: userId,
      expiresIn: 3600,
      ...options,
    });

  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: 'Refresh Test', industry: 'HEALTHCARE' },
    });
  });

  afterAll(async () => {
    await removeStaff(...created);
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  describe('login sets the refresh cookie', () => {
    it('as httpOnly, SameSite=Strict, limited to the auth path, and never in the body', async () => {
      const { res, raw, cookie } = await signIn(await newStaff());
      expect(raw).toBeDefined();
      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/SameSite=Strict/i);
      expect(raw).toMatch(/Path=\/api\/v1\/auth/i);
      expect(raw).not.toMatch(/;\s*Secure/i); // plain http: a Secure cookie would be dropped
      expect(JSON.stringify(res.body)).not.toContain(cookie.split('=')[1]);
      expect(res.body.data).not.toHaveProperty('refreshToken');
    });

    it('with Secure when the request came over https (behind the proxy)', async () => {
      const { raw } = await signIn(await newStaff(), { 'X-Forwarded-Proto': 'https' });
      expect(raw).toMatch(/;\s*Secure/i);
    });
  });

  describe('POST /auth/refresh', () => {
    it('gives a new access token that works, and a new cookie', async () => {
      const staff = await newStaff();
      const { cookie } = await signIn(staff);

      const res = await refreshWith(cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(staff.id);
      expect(JSON.stringify(res.body)).not.toContain('refreshToken');
      expect(((res.headers['set-cookie'] as unknown as string[]) ?? []).some((c) => c.startsWith('refresh_token='))).toBe(true);

      const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.token}`);
      expect(me.status).toBe(200);
    });

    it('needs the custom header (400) and a cookie (401)', async () => {
      const { cookie } = await signIn(await newStaff());
      expect((await refreshWith(cookie, {})).status).toBe(400);
      const noCookie = await request(app).post('/api/v1/auth/refresh').set('X-Forwarded-For', freshIp()).set(csrf);
      expect(noCookie.status).toBe(401);
    });

    it('refuses garbage and clears the cookie', async () => {
      const res = await refreshWith('refresh_token=garbage');
      expect(res.status).toBe(401);
      expect(((res.headers['set-cookie'] as unknown as string[]) ?? []).join(';')).toMatch(/refresh_token=;/);
    });

    it('does not accept an access token as a refresh token, or the reverse', async () => {
      const staff = await newStaff();
      const { cookie, access } = await signIn(staff);

      expect((await refreshWith(`refresh_token=${access}`)).status).toBe(401);

      const refreshValue = cookie.split('=')[1];
      const asBearer = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${refreshValue}`);
      expect(asBearer.status).toBe(401);
    });

    it('refuses expired, wrongly signed and too-old tokens', async () => {
      const staff = await newStaff();
      const row = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
      const now = Math.floor(Date.now() / 1000);

      const expired = refreshTokenFor(staff.id, row.updatedAt.getTime(), now, { expiresIn: -10 });
      const wrongKey = jwt.sign({ tid: tenantId, uv: row.updatedAt.getTime(), ss: now }, 'another-secret-that-is-long-enough-123', {
        algorithm: 'HS256', issuer: 'booking-agent', audience: 'refresh', subject: staff.id, expiresIn: 3600,
      });
      const tooOld = refreshTokenFor(staff.id, row.updatedAt.getTime(), now - 31 * 24 * 3600);
      const fine = refreshTokenFor(staff.id, row.updatedAt.getTime(), now - 29 * 24 * 3600);

      for (const token of [expired, wrongKey, tooOld]) {
        expect((await refreshWith(`refresh_token=${token}`)).status).toBe(401);
      }
      expect((await refreshWith(`refresh_token=${fine}`)).status).toBe(200);
    });

    it('stops working when the user is deactivated or changed (password reset, role change)', async () => {
      const off = await newStaff();
      const offCookie = (await signIn(off)).cookie;
      await prisma.user.update({ where: { id: off.id }, data: { isActive: false } });
      expect((await refreshWith(offCookie)).status).toBe(401);

      const changed = await newStaff();
      const changedCookie = (await signIn(changed)).cookie;
      await prisma.user.update({ where: { id: changed.id }, data: { role: 'FRONT_DESK' } });
      expect((await refreshWith(changedCookie)).status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the cookie and ends the sessions: the old refresh token stops working', async () => {
      const staff = await newStaff();
      const first = await signIn(staff);
      const second = await signIn(staff); // a second device

      const out = await request(app).post('/api/v1/auth/logout').set(csrf).set('Cookie', first.cookie);
      expect(out.status).toBe(200);
      expect(((out.headers['set-cookie'] as unknown as string[]) ?? []).join(';')).toMatch(/refresh_token=;/);

      expect((await refreshWith(first.cookie)).status).toBe(401);
      expect((await refreshWith(second.cookie)).status).toBe(401); // logged out everywhere
    });

    it('needs the custom header, and is harmless without a cookie', async () => {
      const { cookie } = await signIn(await newStaff());
      expect((await request(app).post('/api/v1/auth/logout').set('Cookie', cookie)).status).toBe(400);
      expect((await request(app).post('/api/v1/auth/logout').set(csrf)).status).toBe(200);
      expect((await refreshWith(cookie)).status).toBe(200); // the bad request revoked nothing
    });
  });
});
